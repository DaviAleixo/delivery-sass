import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { DAYS_CONFIG, getDayDisplayName } from "./settingsConstants";

export default function HoursTab({
  settings,
  handleToggleAllDays,
  handleToggleDay,
  handleDayTime,
  handleCopyDayTimeToAll,
}) {
  const openDaysList = Array.isArray(settings.open_days) ? settings.open_days : [];

  return (
    <Card className="border-0 shadow-md">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-xl font-bold text-stone-900">
              Dias e Horários de Funcionamento
            </CardTitle>
            <p className="text-xs text-stone-500 mt-0.5">
              Defina os turnos em que o cardápio aceita pedidos em cada dia da semana.
            </p>
          </div>

          {/* Atalhos rápidos */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => handleToggleAllDays(true)}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
            >
              Marcar Todos
            </button>
            <span className="text-stone-300">•</span>
            <button
              type="button"
              onClick={() => handleToggleAllDays(false)}
              className="text-xs font-bold text-stone-500 hover:text-stone-700 hover:underline cursor-pointer"
            >
              Desmarcar Todos
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {DAYS_CONFIG.map((cfg) => {
            const d = openDaysList.find(
              (item) => item.day === cfg.day || Number(item.day) === cfg.day
            ) || { day: cfg.day, enabled: false, opening_time: "18:00", closing_time: "23:00" };

            const isEnabled = Boolean(d.enabled);

            return (
              <div
                key={cfg.day}
                className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isEnabled
                    ? "bg-white border-stone-200/90 shadow-2xs"
                    : "bg-stone-50/70 border-stone-100 opacity-60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={() => handleToggleDay(cfg.day)}
                    className="w-4 h-4 accent-red-600 rounded cursor-pointer"
                  />
                  <div>
                    <span className="text-sm font-bold text-stone-900 block">
                      {getDayDisplayName(cfg.day)}
                    </span>
                    <span className="text-[11px] text-stone-400">
                      {isEnabled ? "Aberto" : "Fechado"}
                    </span>
                  </div>
                </div>

                {isEnabled ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs text-stone-500 font-semibold">De:</Label>
                      <Input
                        type="time"
                        value={d.opening_time || "18:00"}
                        onChange={(e) =>
                          handleDayTime(d.day, "opening_time", e.target.value)
                        }
                        className="h-9 w-28 bg-white border-stone-300 text-sm font-semibold rounded-xl"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs text-stone-500 font-semibold">Até:</Label>
                      <Input
                        type="time"
                        value={d.closing_time || "23:00"}
                        onChange={(e) =>
                          handleDayTime(d.day, "closing_time", e.target.value)
                        }
                        className="h-9 w-28 bg-white border-stone-300 text-sm font-semibold rounded-xl"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleCopyDayTimeToAll(
                          d.opening_time || "18:00",
                          d.closing_time || "23:00"
                        )
                      }
                      title="Replicar este horário para todos os outros dias"
                      className="h-9 px-2.5 text-xs font-semibold text-stone-600 hover:text-stone-900 border-stone-200 hover:bg-stone-100 rounded-xl flex items-center gap-1.5 shadow-2xs"
                    >
                      <Copy className="w-3.5 h-3.5 text-stone-500" />
                      <span className="hidden sm:inline">Replicar p/ todos</span>
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-stone-400 italic pl-7 sm:pl-0">
                    Não aceita pedidos neste dia
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
