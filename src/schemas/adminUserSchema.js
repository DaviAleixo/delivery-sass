import { z } from "zod";

export const adminUserSchema = z.object({
  username: z.string().min(3, "Nome de usuário deve ter no mínimo 3 caracteres"),
  password: z.string().min(4, "Senha deve ter no mínimo 4 caracteres").optional().or(z.literal("")),
  role: z.enum(["admin", "staff"]).default("admin"),
  active: z.boolean().default(true),
  permissions: z.array(z.string()).min(1, "Selecione pelo menos uma permissão de tela")
});
