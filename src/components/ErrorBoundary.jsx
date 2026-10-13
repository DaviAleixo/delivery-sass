import React from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary capturou um erro não tratado:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-stone-200 p-6 sm:p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto shadow-sm">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-xl font-bold text-stone-900">Ops! Algo deu errado ao carregar</h2>
              <p className="text-xs text-stone-500 mt-1">
                Tivemos uma instabilidade momentânea ao processar esta tela.
              </p>
            </div>

            {process.env.NODE_ENV === "development" && this.state.error?.message && (
              <div className="bg-stone-100 rounded-xl p-3 text-left font-mono text-[11px] text-red-600 overflow-x-auto max-h-32">
                {this.state.error.message}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                onClick={this.handleReload}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white gap-2 h-11 rounded-xl"
              >
                <RefreshCw className="w-4 h-4" />
                Recarregar Página
              </Button>
              <Button
                variant="outline"
                onClick={this.handleGoHome}
                className="flex-1 border-stone-300 hover:bg-stone-100 text-stone-700 gap-2 h-11 rounded-xl"
              >
                <Home className="w-4 h-4" />
                Início
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
