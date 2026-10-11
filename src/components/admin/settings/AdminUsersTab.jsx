import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Users,
  UserPlus,
  Key,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  Shield,
  Edit2,
  Trash2,
  X,
  Save,
} from "lucide-react";
import { ALL_ADMIN_SCREENS } from "./settingsConstants";

export default function AdminUsersTab({
  adminUsers,
  handleOpenAddUser,
  handleOpenEditUser,
  handleDeleteUser,
  isUserModalOpen,
  setIsUserModalOpen,
  editingUserId,
  userFormData,
  setUserFormData,
  showPassword,
  setShowPassword,
  isSavingUser,
  handleSaveUser,
  handleSelectAllScreens,
  handleDeselectAllScreens,
  toggleScreenPermission,
}) {
  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-md">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-xl font-bold text-stone-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-600" />
                <span>Usuários & Acessos do Painel</span>
              </CardTitle>
              <p className="text-xs text-stone-500 mt-0.5">
                Gerencie quem pode acessar o painel e defina permissões específicas para cada colaborador.
              </p>
            </div>
            <Button
              type="button"
              onClick={handleOpenAddUser}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-9 px-4 rounded-xl flex items-center gap-1.5 shadow-sm self-start sm:self-auto cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Novo Usuário</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border border-stone-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-50 text-stone-600 border-b border-stone-200 font-bold">
                    <th className="py-3 px-4">Usuário</th>
                    <th className="py-3 px-4">Cargo</th>
                    <th className="py-3 px-4">Permissões</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {adminUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-stone-400">
                        Nenhum usuário cadastrado.
                      </td>
                    </tr>
                  ) : (
                    adminUsers.map((user) => {
                      const userPerms = Array.isArray(user.permissions)
                        ? user.permissions
                        : typeof user.permissions === "string"
                        ? JSON.parse(user.permissions || '["*"]')
                        : ["*"];
                      const isAll = userPerms.includes("*");

                      return (
                        <tr key={user.id} className="hover:bg-stone-50/80 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-stone-900 text-amber-400 font-black text-xs flex items-center justify-center uppercase shadow-xs">
                                {(user.username || "A").slice(0, 2)}
                              </div>
                              <div>
                                <span className="font-bold text-stone-900 block">
                                  {user.username}
                                </span>
                                {user.initial_password ? (
                                  <span className="text-[11px] text-stone-600 flex items-center gap-1.5 font-mono mt-0.5">
                                    <Key className="w-3 h-3 text-amber-500" /> Senha atual:
                                    <span className="font-bold text-stone-900 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded text-[11px]">
                                      {user.initial_password}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-stone-400 flex items-center gap-1 font-mono">
                                    <Lock className="w-3 h-3 text-stone-400" /> ••••••••
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                user.role === "admin"
                                  ? "bg-purple-100 text-purple-800 border border-purple-200"
                                  : "bg-blue-100 text-blue-800 border border-blue-200"
                              }`}
                            >
                              {user.role === "admin" ? "Administrador" : "Funcionário"}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            {isAll ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                Acesso Total (Todas as Telas)
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200"
                                title={userPerms.join(", ")}
                              >
                                <Shield className="w-3.5 h-3.5 text-amber-600" />
                                {userPerms.length}{" "}
                                {userPerms.length === 1 ? "Tela Permitida" : "Telas Permitidas"}
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                user.active !== false
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-stone-100 text-stone-600"
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  user.active !== false ? "bg-emerald-500" : "bg-stone-400"
                                }`}
                              />
                              {user.active !== false ? "Ativo" : "Inativo"}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenEditUser(user)}
                                className="h-8 px-2.5 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg text-xs font-bold flex items-center gap-1"
                              >
                                <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                                Editar
                              </Button>

                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteUser(user)}
                                disabled={adminUsers.length <= 1}
                                className="h-8 px-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg text-xs"
                                title="Excluir Usuário"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Adicionar / Editar Usuário */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl border border-stone-200 p-6 w-full max-w-lg shadow-2xl space-y-4 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-stone-900">
                    {editingUserId ? "Editar Usuário e Permissões" : "Novo Usuário do Painel"}
                  </h3>
                  <p className="text-xs text-stone-500">
                    {editingUserId
                      ? "Altere credenciais e configure quais telas ele pode acessar."
                      : "Cadastre login, senha e escolha as permissões de acesso."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsUserModalOpen(false)}
                className="p-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Login */}
              <div>
                <Label htmlFor="modal_username" className="text-xs font-bold text-stone-700">
                  Nome de Usuário (Login) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="modal_username"
                  value={userFormData.username}
                  onChange={(e) =>
                    setUserFormData({ ...userFormData, username: e.target.value })
                  }
                  placeholder="Ex: davi, joao, caixa1, gerente"
                  className="mt-1 rounded-xl text-sm"
                />
              </div>

              {/* Senha */}
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="modal_password" className="text-xs font-bold text-stone-700">
                    {editingUserId ? "Nova Senha (Opcional)" : "Senha de Acesso"}{" "}
                    {!editingUserId && <span className="text-red-500">*</span>}
                  </Label>
                  {editingUserId && (
                    <span className="text-[10px] text-stone-400">Em branco = não altera</span>
                  )}
                </div>
                <div className="relative mt-1">
                  <Input
                    id="modal_password"
                    type={showPassword ? "text" : "password"}
                    value={userFormData.password}
                    onChange={(e) =>
                      setUserFormData({ ...userFormData, password: e.target.value })
                    }
                    placeholder={
                      editingUserId ? "Digite apenas para alterar a senha" : "Digite a senha"
                    }
                    className="pr-10 rounded-xl text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-0.5"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Cargo */}
              <div>
                <Label htmlFor="modal_role" className="text-xs font-bold text-stone-700">
                  Cargo
                </Label>
                <select
                  id="modal_role"
                  value={userFormData.role}
                  onChange={(e) =>
                    setUserFormData({ ...userFormData, role: e.target.value })
                  }
                  className="mt-1 w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                >
                  <option value="admin">Administrador (Adm)</option>
                  <option value="funcionario">Funcionário</option>
                </select>
              </div>

              {/* Permissões */}
              <div className="pt-2 border-t border-stone-200">
                <Label className="text-xs font-bold text-stone-900 block mb-2">
                  Permissões de Telas do Painel
                </Label>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() =>
                      setUserFormData({
                        ...userFormData,
                        access_type: "all",
                        permissions: ALL_ADMIN_SCREENS.map((s) => s.key),
                      })
                    }
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      userFormData.access_type === "all"
                        ? "bg-purple-50 border-purple-500 text-purple-950 font-bold shadow-2xs"
                        : "bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs">
                      <ShieldCheck className="w-4 h-4 text-purple-600" />
                      <span>Acesso Total</span>
                    </div>
                    <span className="text-[11px] text-stone-500 font-normal block mt-1">
                      Todas as telas liberadas
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setUserFormData({
                        ...userFormData,
                        access_type: "custom",
                      })
                    }
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      userFormData.access_type === "custom"
                        ? "bg-purple-50 border-purple-500 text-purple-950 font-bold shadow-2xs"
                        : "bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs">
                      <Shield className="w-4 h-4 text-amber-600" />
                      <span>Personalizado</span>
                    </div>
                    <span className="text-[11px] text-stone-500 font-normal block mt-1">
                      Escolher telas uma por uma
                    </span>
                  </button>
                </div>

                {userFormData.access_type === "custom" && (
                  <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 space-y-2.5 animate-in fade-in">
                    <div className="flex items-center justify-between pb-2 border-b border-stone-200 text-xs">
                      <span className="text-stone-600 font-bold">
                        Selecione as telas permitidas:
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSelectAllScreens}
                          className="text-[11px] font-bold text-purple-600 hover:underline"
                        >
                          Marcar Todas
                        </button>
                        <span className="text-stone-300">|</span>
                        <button
                          type="button"
                          onClick={handleDeselectAllScreens}
                          className="text-[11px] font-bold text-stone-500 hover:underline"
                        >
                          Desmarcar Todas
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                      {ALL_ADMIN_SCREENS.map((screen) => {
                        const isChecked = userFormData.permissions.includes(screen.key);
                        return (
                          <label
                            key={screen.key}
                            className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer transition-all text-xs select-none ${
                              isChecked
                                ? "bg-white border-purple-400 font-bold text-stone-900 shadow-2xs"
                                : "bg-stone-100/60 border-stone-200 text-stone-500 hover:bg-stone-100"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleScreenPermission(screen.key)}
                              className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                            />
                            <span>{screen.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Status Ativo */}
              <div className="flex items-center justify-between p-3 bg-stone-50 rounded-2xl border border-stone-200/80">
                <div>
                  <span className="text-xs font-bold text-stone-800 block">Usuário Ativo</span>
                  <span className="text-[11px] text-stone-500 block">
                    Permite que este usuário faça login no painel
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={userFormData.active}
                  onChange={(e) =>
                    setUserFormData({ ...userFormData, active: e.target.checked })
                  }
                  className="w-5 h-5 accent-purple-600 rounded cursor-pointer"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 sticky bottom-0 bg-white z-10">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsUserModalOpen(false)}
                className="rounded-xl text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleSaveUser}
                disabled={isSavingUser}
                className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                {isSavingUser ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    {editingUserId ? "Salvar Alterações" : "Criar Usuário"}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
