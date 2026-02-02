-- Allow users to insert their own role after signup
CREATE POLICY "Users can create their own role" 
ON public.user_roles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);