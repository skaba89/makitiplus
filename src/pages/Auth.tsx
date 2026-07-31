import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n/config";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Store, User, Phone, Mail, Lock, Shield, KeyRound, CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { PasswordStrengthMeter } from "@/components/users/PasswordStrengthMeter";
import { checkPassword } from "@/lib/passwordPolicy";
import { reportError } from "@/lib/sentry";
import { extractErrorMessage } from "@/lib/extractErrorMessage";
import { EdgeFunctionResponse, ADMIN_ROLES } from "@/types";

// Construits à l'appel (pas au chargement du module) pour refléter la
// langue active au moment de la validation — le singleton i18n est utilisé
// directement plutôt que useTranslation(), indisponible en dehors du composant.
const buildLoginSchema = () =>
  z.object({
    email: z.string().email(i18n.t("auth:validation.emailInvalid")),
    password: z.string().min(6, i18n.t("auth:validation.passwordMinLength")),
  });

const buildSignupSchema = () =>
  z.object({
    email: z.string().email(i18n.t("auth:validation.emailInvalid")),
    password: z.string().min(6, i18n.t("auth:validation.passwordMinLength")),
    businessName: z.string().min(2, i18n.t("auth:validation.businessNameRequired")),
    ownerName: z.string().min(2, i18n.t("auth:validation.ownerNameRequired")),
    phone: z.string().optional(),
  });

const getAuthErrorMessage = (error: unknown): string => {
  const rawMessage = error instanceof Error ? error.message : extractErrorMessage(error);
  const message = rawMessage || i18n.t("auth:errors.generic");

  if (/Invalid login credentials/i.test(message)) {
    return i18n.t("auth:errors.invalidCredentials");
  }

  if (/Email not confirmed/i.test(message)) {
    return i18n.t("auth:errors.emailNotConfirmed");
  }

  if (/Failed to fetch|NetworkError|ERR_CONNECTION_TIMED_OUT|timeout|Load failed|fetch/i.test(message)) {
    return i18n.t("auth:errors.networkError");
  }

  if (/r[oô]le|role|user_roles|profile|profiles|permission denied|42501|406|RLS/i.test(message)) {
    return i18n.t("auth:errors.roleError", { message });
  }

  if (/User already registered/i.test(message)) {
    return i18n.t("auth:errors.userExists");
  }

  return message;
};

const Auth = () => {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const resetToken = searchParams.get("reset_token");

  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("login");
  const [adminExists, setAdminExists] = useState<boolean | null>(null);

  // Reset (redemption) state
  const [resetPwd, setResetPwd] = useState("");
  const [resetPwd2, setResetPwd2] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup form state (only for first super admin)
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    // Check if a super admin already exists
    const checkAdmin = async () => {
      const { data, error } = await supabase.rpc("admin_exists");
      if (!error) {
        setAdminExists(data === true);
        if (data === true) setActiveTab("login");
        else setActiveTab("signup");
      } else {
        setAdminExists(true); // safer fallback: hide signup
      }
    };
    checkAdmin();
  }, []);

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetToken) return;
    if (resetPwd !== resetPwd2) {
      toast({ variant: "destructive", title: t("errors.genericErrorTitle"), description: t("errors.passwordMismatch") });
      return;
    }
    const check = checkPassword(resetPwd);
    if (!check.ok) {
      toast({ variant: "destructive", title: t("errors.passwordPolicyTitle"), description: check.errors.join(" • ") });
      return;
    }
    setResetSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("redeem-reset-token", {
        body: { token: resetToken, newPassword: resetPwd },
      });
      const fnData = data as EdgeFunctionResponse | undefined;
      if (error || fnData?.error) {
        throw new Error(fnData?.error || error?.message || t("errors.genericErrorTitle"));
      }
      setResetDone(true);
      toast({ title: t("success.passwordUpdatedTitle"), description: t("success.passwordUpdatedDesc") });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      reportError(err instanceof Error ? err : new Error(String(err)));
      toast({ variant: "destructive", title: t("errors.invalidLinkTitle"), description: message });
    } finally {
      setResetSubmitting(false);
    }
  };

  const clearResetToken = () => {
    searchParams.delete("reset_token");
    setSearchParams(searchParams, { replace: true });
    setResetDone(false);
    setResetPwd("");
    setResetPwd2("");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const validation = buildLoginSchema().safeParse({
        email: loginEmail,
        password: loginPassword,
      });

      if (!validation.success) {
        toast({
          variant: "destructive",
          title: t("errors.validationTitle"),
          description: validation.error.errors[0].message,
        });
        setIsLoading(false);
        return;
      }

      const { error } = await signIn(loginEmail, loginPassword);

      if (error) {
        toast({
          variant: "destructive",
          title: t("errors.loginErrorTitle"),
          description: getAuthErrorMessage(error),
        });
      } else {
        toast({
          title: t("success.loginTitle"),
          description: t("success.loginDesc"),
        });
        navigate("/dashboard");
      }
    } catch (error) {
      reportError(error instanceof Error ? error : new Error(extractErrorMessage(error)));
      toast({
        variant: "destructive",
        title: t("errors.loginErrorTitle"),
        description: getAuthErrorMessage(error),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Valider la politique de mot de passe (min 8, maj, min, chiffre, symbole)
      const pwdCheck = checkPassword(signupPassword);
      if (!pwdCheck.ok) {
        toast({
          variant: "destructive",
          title: t("errors.passwordPolicyTitle"),
          description: pwdCheck.errors.join(" • "),
        });
        setIsLoading(false);
        return;
      }

      const validation = buildSignupSchema().safeParse({
        email: signupEmail,
        password: signupPassword,
        businessName,
        ownerName,
        phone,
      });

      if (!validation.success) {
        toast({
          variant: "destructive",
          title: t("errors.validationTitle"),
          description: validation.error.errors[0].message,
        });
        setIsLoading(false);
        return;
      }

      // Re-check admin existence to prevent race
      const { data: alreadyExists } = await supabase.rpc("admin_exists");
      if (alreadyExists === true) {
        toast({
          variant: "destructive",
          title: t("errors.signupClosedTitle"),
          description: t("errors.signupClosedDesc"),
        });
        setAdminExists(true);
        setActiveTab("login");
        setIsLoading(false);
        return;
      }

      const { error } = await signUp(signupEmail, signupPassword, {
        businessName,
        ownerName,
        phone,
        role: ADMIN_ROLES[0],
      });

      if (error) {
        toast({
          variant: "destructive",
          title: t("errors.signupErrorTitle"),
          description: getAuthErrorMessage(error),
        });
      } else {
        toast({
          title: t("success.signupTitle"),
          description: t("success.signupDesc"),
        });
        // Auto-confirm is enabled, sign in directly
        await signIn(signupEmail, signupPassword);
        navigate("/dashboard");
      }
    } catch (error) {
      reportError(error instanceof Error ? error : new Error(extractErrorMessage(error)));
      toast({
        variant: "destructive",
        title: t("errors.signupErrorTitle"),
        description: getAuthErrorMessage(error),
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Render redemption screen when arriving via SMS magic link
  if (resetToken) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-hero-gradient flex items-center justify-center mx-auto mb-4">
              <KeyRound className="h-8 w-8 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold">{t("reset.title")}</h1>
            <p className="text-muted-foreground mt-2">
              {t("reset.subtitle")}
            </p>
          </div>

          <Card className="card-elevated">
            <CardContent className="pt-6">
              {resetDone ? (
                <div className="text-center space-y-4">
                  <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
                  <div>
                    <h2 className="font-semibold text-lg">{t("reset.doneTitle")}</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t("reset.doneDesc")}
                    </p>
                  </div>
                  <Button className="w-full" onClick={clearResetToken}>
                    {t("buttons.login")}
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleResetSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-pwd">{t("reset.newPasswordLabel")}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="reset-pwd"
                        type="password"
                        value={resetPwd}
                        onChange={(e) => setResetPwd(e.target.value)}
                        className="pl-10"
                        placeholder={t("reset.newPasswordPlaceholder")}
                        required
                        autoComplete="new-password"
                      />
                    </div>
                    <PasswordStrengthMeter password={resetPwd} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reset-pwd2">{t("reset.confirmPasswordLabel")}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="reset-pwd2"
                        type="password"
                        value={resetPwd2}
                        onChange={(e) => setResetPwd2(e.target.value)}
                        className="pl-10"
                        required
                        autoComplete="new-password"
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" size="lg" disabled={resetSubmitting}>
                    {resetSubmitting ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("reset.submitting")}</>
                    ) : (
                      <>{t("reset.submitButton")}</>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={clearResetToken}
                    disabled={resetSubmitting}
                  >
                    {t("reset.cancelButton")}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground mt-6">
            {t("reset.footerNotice")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-hero-gradient flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl font-bold text-primary-foreground">M</span>
          </div>
          <h1 className="text-2xl font-bold">
            Makiti<span className="text-gradient">Plus</span>
          </h1>
          <p className="text-muted-foreground mt-2">
            {t("tagline")}
          </p>
        </div>

        <Card className="card-elevated">
          <CardHeader className="text-center pb-2">
            <CardTitle>{t("welcome")}</CardTitle>
            <CardDescription>
              {adminExists === false
                ? t("welcomeSuperAdminDesc")
                : t("welcomeLoginDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className={`grid w-full mb-6 ${adminExists === false ? "grid-cols-2" : "grid-cols-1"}`}>
                <TabsTrigger value="login">{t("tabs.login")}</TabsTrigger>
                {adminExists === false && (
                  <TabsTrigger value="signup">{t("tabs.signup")}</TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">{t("fields.email")}</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder={t("placeholders.email")}
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login-password">{t("fields.password")}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="login-password"
                        type="password"
                        placeholder={t("placeholders.password")}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("buttons.loggingIn")}
                      </>
                    ) : (
                      t("buttons.login")
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">{t("fields.email")}</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder={t("placeholders.email")}
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password">{t("fields.password")}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder={t("placeholders.password")}
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="business-name">{t("fields.businessName")}</Label>
                    <div className="relative">
                      <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="business-name"
                        type="text"
                        placeholder={t("placeholders.businessName")}
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="owner-name">{t("fields.ownerName")}</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="owner-name"
                        type="text"
                        placeholder={t("placeholders.ownerName")}
                        value={ownerName}
                        onChange={(e) => setOwnerName(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">{t("fields.phone")}</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="phone"
                        type="tel"
                        placeholder={t("placeholders.phone")}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-start gap-2">
                    <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      {t("superAdminNoticePrefix")}<strong className="text-foreground">{t("superAdminNoticeStrong")}</strong>{t("superAdminNoticeSuffix")}
                    </p>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("buttons.signingUp")}
                      </>
                    ) : (
                      t("buttons.signup")
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          {t("termsNotice")}
        </p>
      </div>
    </div>
  );
};

export default Auth;
