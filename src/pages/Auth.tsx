import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Store, User, Phone, Mail, Lock, Shield, KeyRound, CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { PasswordStrengthMeter } from "@/components/users/PasswordStrengthMeter";
import { checkPassword } from "@/lib/passwordPolicy";
import { EdgeFunctionResponse } from "@/types";

type AppRole = Database["public"]["Enums"]["app_role"];

const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
});

const signupSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
  businessName: z.string().min(2, "Nom de l'entreprise requis"),
  ownerName: z.string().min(2, "Nom du propriétaire requis"),
  phone: z.string().optional(),
});

const Auth = () => {
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
      toast({ variant: "destructive", title: "Erreur", description: "Les mots de passe ne correspondent pas" });
      return;
    }
    const check = checkPassword(resetPwd);
    if (!check.ok) {
      toast({ variant: "destructive", title: "Mot de passe non conforme", description: check.errors.join(" • ") });
      return;
    }
    setResetSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("redeem-reset-token", {
        body: { token: resetToken, newPassword: resetPwd },
      });
      const fnData = data as EdgeFunctionResponse | undefined;
      if (error || fnData?.error) {
        throw new Error(fnData?.error || error?.message || "Erreur");
      }
      setResetDone(true);
      toast({ title: "Mot de passe mis à jour", description: "Vous pouvez maintenant vous connecter." });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "Lien invalide", description: message });
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
      const validation = loginSchema.safeParse({
        email: loginEmail,
        password: loginPassword,
      });

      if (!validation.success) {
        toast({
          variant: "destructive",
          title: "Erreur de validation",
          description: validation.error.errors[0].message,
        });
        setIsLoading(false);
        return;
      }

      const { error } = await signIn(loginEmail, loginPassword);

      if (error) {
        let message = "Une erreur est survenue";
        if (error.message.includes("Invalid login credentials")) {
          message = "Email ou mot de passe incorrect";
        } else if (error.message.includes("Email not confirmed")) {
          message = "Veuillez confirmer votre email avant de vous connecter";
        }
        toast({
          variant: "destructive",
          title: "Erreur de connexion",
          description: message,
        });
      } else {
        toast({
          title: "Connexion réussie",
          description: "Bienvenue sur MalikiPlus !",
        });
        navigate("/dashboard");
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Une erreur inattendue est survenue",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const validation = signupSchema.safeParse({
        email: signupEmail,
        password: signupPassword,
        businessName,
        ownerName,
        phone,
      });

      if (!validation.success) {
        toast({
          variant: "destructive",
          title: "Erreur de validation",
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
          title: "Inscription fermée",
          description: "Un administrateur existe déjà. Contactez-le pour obtenir un compte.",
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
        role: "admin",
      });

      if (error) {
        let message = "Une erreur est survenue";
        if (error.message.includes("User already registered")) {
          message = "Un compte existe déjà avec cet email";
        }
        toast({
          variant: "destructive",
          title: "Erreur d'inscription",
          description: message,
        });
      } else {
        toast({
          title: "Compte créé avec succès",
          description: "Connexion automatique...",
        });
        // Auto-confirm is enabled, sign in directly
        await signIn(signupEmail, signupPassword);
        navigate("/dashboard");
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Une erreur inattendue est survenue",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const roleLabels: Record<AppRole, { label: string; description: string }> = {
    admin: { label: "Administrateur", description: "Accès complet au système" },
    manager: { label: "Manager", description: "Gestion de l'équipe et rapports" },
    vendeur: { label: "Vendeur", description: "Point de vente et stocks" },
    comptable: { label: "Comptable", description: "Finances et rapports" },
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
            <h1 className="text-2xl font-bold">Nouveau mot de passe</h1>
            <p className="text-muted-foreground mt-2">
              Lien à usage unique — définissez votre nouveau mot de passe
            </p>
          </div>

          <Card className="card-elevated">
            <CardContent className="pt-6">
              {resetDone ? (
                <div className="text-center space-y-4">
                  <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
                  <div>
                    <h2 className="font-semibold text-lg">Mot de passe mis à jour</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Toutes vos sessions ont été déconnectées. Connectez-vous avec votre nouveau mot de passe.
                    </p>
                  </div>
                  <Button className="w-full" onClick={clearResetToken}>
                    Se connecter
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleResetSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-pwd">Nouveau mot de passe</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="reset-pwd"
                        type="password"
                        value={resetPwd}
                        onChange={(e) => setResetPwd(e.target.value)}
                        className="pl-10"
                        placeholder="Min 8 car. + maj/min/chiffre/symbole"
                        required
                        autoComplete="new-password"
                      />
                    </div>
                    <PasswordStrengthMeter password={resetPwd} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reset-pwd2">Confirmer le mot de passe</Label>
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
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Validation…</>
                    ) : (
                      <>Réinitialiser le mot de passe</>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={clearResetToken}
                    disabled={resetSubmitting}
                  >
                    Annuler
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Lien valide 30 minutes — usage unique. Contactez votre administrateur si le lien a expiré.
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
            <span className="text-3xl font-bold text-primary-foreground">S</span>
          </div>
          <h1 className="text-2xl font-bold">
            Sahel<span className="text-gradient">POS</span>
          </h1>
          <p className="text-muted-foreground mt-2">
            Système de caisse moderne pour l'Afrique
          </p>
        </div>

        <Card className="card-elevated">
          <CardHeader className="text-center pb-2">
            <CardTitle>Bienvenue</CardTitle>
            <CardDescription>
              {adminExists === false
                ? "Créez votre compte Super Administrateur"
                : "Connectez-vous à votre compte"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className={`grid w-full mb-6 ${adminExists === false ? "grid-cols-2" : "grid-cols-1"}`}>
                <TabsTrigger value="login">Connexion</TabsTrigger>
                {adminExists === false && (
                  <TabsTrigger value="signup">Inscription</TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="votre@email.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login-password">Mot de passe</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="••••••••"
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
                        Connexion...
                      </>
                    ) : (
                      "Se connecter"
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="votre@email.com"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Mot de passe</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="••••••••"
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="business-name">Nom de l'entreprise</Label>
                    <div className="relative">
                      <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="business-name"
                        type="text"
                        placeholder="Ma Boutique"
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="owner-name">Nom du propriétaire</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="owner-name"
                        type="text"
                        placeholder="Votre nom"
                        value={ownerName}
                        onChange={(e) => setOwnerName(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Téléphone (optionnel)</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="+221 77 000 00 00"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-start gap-2">
                    <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      Vous serez le <strong className="text-foreground">Super Administrateur</strong> de la boutique. Vous pourrez ensuite créer les comptes vendeurs, managers et comptables.
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
                        Inscription...
                      </>
                    ) : (
                      "Créer un compte"
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          En vous inscrivant, vous acceptez nos conditions d'utilisation
        </p>
      </div>
    </div>
  );
};

export default Auth;
