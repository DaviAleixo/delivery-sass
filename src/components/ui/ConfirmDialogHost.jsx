import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Trash2, HelpCircle, CheckCircle2 } from "lucide-react";

let confirmListener = null;
const pendingQueue = [];
let activeItem = null;

function dispatchNext() {
  if (activeItem || pendingQueue.length === 0 || !confirmListener) return;
  activeItem = pendingQueue.shift();
  confirmListener(activeItem);
}

/**
 * Abre um diálogo de confirmação personalizado do sistema (substitui window.confirm).
 * Aceita uma string simples ou um objeto { title, description, confirmText, cancelText, variant }.
 * @returns {Promise<boolean>}
 */
export function appConfirm(input) {
  const opts =
    typeof input === "string"
      ? { title: "Confirmar ação", description: input }
      : { ...(input || {}) };

  return new Promise((resolve) => {
    pendingQueue.push({
      title: opts.title || "Confirmar ação",
      description: opts.description || "",
      confirmText: opts.confirmText || "Confirmar",
      cancelText: opts.cancelText || "Cancelar",
      variant: opts.variant || "default",
      resolve,
    });
    dispatchNext();
  });
}

export function ConfirmDialogHost() {
  const [current, setCurrent] = useState(null);

  useEffect(() => {
    confirmListener = (item) => setCurrent(item);
    dispatchNext();
    return () => {
      confirmListener = null;
    };
  }, []);

  const handleClose = (confirmed) => {
    if (!current) return;
    const { resolve } = current;
    activeItem = null;
    setCurrent(null);
    resolve(Boolean(confirmed));
    setTimeout(dispatchNext, 0);
  };

  const variant = current?.variant || "default";
  const isDanger = variant === "danger";
  const isWarning = variant === "warning";
  const isSuccess = variant === "success";

  const Icon = isDanger ? Trash2 : isWarning ? AlertTriangle : isSuccess ? CheckCircle2 : HelpCircle;
  const iconBgClass = isDanger
    ? "bg-rose-50 text-rose-600 border-rose-200"
    : isWarning
    ? "bg-amber-50 text-amber-600 border-amber-200"
    : isSuccess
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : "bg-stone-100 text-stone-700 border-stone-200";
  const confirmBtnClass = isDanger
    ? "bg-rose-600 hover:bg-rose-700 text-white"
    : isWarning
    ? "bg-amber-600 hover:bg-amber-700 text-white"
    : isSuccess
    ? "bg-emerald-700 hover:bg-emerald-800 text-white"
    : "bg-stone-900 hover:bg-black text-white";

  return (
    <Dialog open={Boolean(current)} onOpenChange={(open) => !open && handleClose(false)}>
      <DialogContent className="sm:max-w-md p-5 rounded-2xl bg-white border border-stone-200 shadow-xl">
        <DialogHeader className="space-y-3 text-left">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${iconBgClass}`}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div className="space-y-1 min-w-0 pt-0.5">
              <DialogTitle className="text-base font-bold text-stone-900 leading-snug">
                {current?.title}
              </DialogTitle>
              {current?.description && (
                <DialogDescription className="text-xs text-stone-600 leading-relaxed whitespace-pre-line">
                  {current.description}
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        <DialogFooter className="pt-3 mt-1 border-t border-stone-100 flex-row justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleClose(false)}
            className="h-9 px-4 text-xs font-semibold border-stone-300 text-stone-700 hover:bg-stone-50 cursor-pointer"
          >
            {current?.cancelText || "Cancelar"}
          </Button>
          <Button
            type="button"
            onClick={() => handleClose(true)}
            className={`h-9 px-4 text-xs font-semibold cursor-pointer ${confirmBtnClass}`}
          >
            {current?.confirmText || "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

