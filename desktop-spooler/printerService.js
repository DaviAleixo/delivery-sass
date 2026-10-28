import { exec, execFile } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * Script PowerShell que utiliza a API nativa WinSpool (winspool.drv) do Windows.
 * Isso permite envio direto de dados RAW para o spooler de impressão do Windows
 * sem depender de janelas de console, drivers gráficos ou diálogos de popup.
 */
const RAW_PRINTER_PS1 = `
param (
    [Parameter(Mandatory=$true)]
    [string]$FilePath,

    [Parameter(Mandatory=$false)]
    [string]$PrinterName
)

Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    public static bool SendFileToPrinter(string szPrinterName, string szFileName) {
        if (!File.Exists(szFileName)) return false;
        byte[] bytes = File.ReadAllBytes(szFileName);

        IntPtr hPrinter = new IntPtr(0);
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "PedeMuleke Comanda";
        di.pDataType = "RAW";

        if (!OpenPrinter(szPrinterName, out hPrinter, IntPtr.Zero)) {
            return false;
        }

        bool success = false;
        if (StartDocPrinter(hPrinter, 1, di)) {
            if (StartPagePrinter(hPrinter)) {
                IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
                Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
                int written = 0;
                success = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out written);
                Marshal.FreeCoTaskMem(pUnmanagedBytes);
                EndPagePrinter(hPrinter);
            }
            EndDocPrinter(hPrinter);
        }
        ClosePrinter(hPrinter);
        return success;
    }
}
"@

if ([string]::IsNullOrWhiteSpace($PrinterName)) {
    $PrinterName = (Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1).Name
    if ([string]::IsNullOrWhiteSpace($PrinterName)) {
        $PrinterName = (Get-CimInstance Win32_Printer | Select-Object -First 1).Name
    }
}

if ([string]::IsNullOrWhiteSpace($PrinterName)) {
    Write-Error "Nenhuma impressora encontrada no Windows."
    exit 1
}

$ok = [RawPrinterHelper]::SendFileToPrinter($PrinterName, $FilePath)
if ($ok) {
    Write-Output "SUCCESS"
    exit 0
} else {
    Write-Error "Falha ao enviar arquivo para a impressora $PrinterName via WinSpool."
    exit 2
}
`;

function ensureHelperScript() {
  const scriptPath = path.join(os.tmpdir(), "pedemuleke_spooler_raw.ps1");
  try {
    fs.writeFileSync(scriptPath, RAW_PRINTER_PS1.trim(), { encoding: "utf8" });
  } catch (_e) {}
  return scriptPath;
}

export function listWindowsPrinters() {
  return new Promise((resolve) => {
    const psCommand = `powershell -NoProfile -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-CimInstance Win32_Printer | Select-Object Name, Default, PortName | ConvertTo-Json"`;

    exec(psCommand, { windowsHide: true }, (error, stdout) => {
      if (error || !stdout.trim()) {
        return listPrintersFallback(resolve);
      }

      try {
        const parsed = JSON.parse(stdout);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        const printers = list
          .filter(p => p && p.Name)
          .map(p => ({
            name: p.Name,
            isDefault: Boolean(p.Default),
            port: p.PortName || ""
          }));

        const defaultPrinter = printers.find(p => p.isDefault)?.name || (printers[0]?.name || "");
        resolve({ printers, defaultPrinter });
      } catch (_jsonErr) {
        listPrintersFallback(resolve);
      }
    });
  });
}

function listPrintersFallback(resolve) {
  const wmicCmd = `wmic printer get name,default /format:csv`;
  exec(wmicCmd, { windowsHide: true }, (err, stdout) => {
    if (err || !stdout) {
      return resolve({ printers: [], defaultPrinter: "" });
    }
    const lines = stdout.split(/\r?\n/).filter(Boolean);
    const printers = [];
    let defaultPrinter = "";

    lines.slice(1).forEach(line => {
      const parts = line.split(",").map(p => p.trim());
      if (parts.length >= 3) {
        const isDef = parts[1]?.toUpperCase() === "TRUE";
        const name = parts[2];
        if (name) {
          printers.push({ name, isDefault: isDef, port: "" });
          if (isDef) defaultPrinter = name;
        }
      }
    });

    resolve({ printers, defaultPrinter: defaultPrinter || printers[0]?.name || "" });
  });
}

/**
 * Envia o texto da comanda diretamente para a impressora do Windows sem abrir nenhuma janela.
 */
export function sendTextToPrinter(text, targetPrinterName) {
  return new Promise((resolve) => {
    let tempPath = "";
    try {
      const helperScriptPath = ensureHelperScript();
      tempPath = path.join(
        os.tmpdir(), 
        `pedemuleke_ticket_${Date.now()}_${Math.random().toString(36).substring(7)}.txt`
      );
      
      // Salva o ticket em codificação Latin-1/Windows-1252 para texto RAW em impressoras ESC/POS
      fs.writeFileSync(tempPath, text, { encoding: "latin1" });

      const args = [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        helperScriptPath,
        "-FilePath",
        tempPath,
      ];
      if (targetPrinterName) {
        args.push("-PrinterName", targetPrinterName);
      }

      execFile("powershell.exe", args, { windowsHide: true }, (error, stdout, stderr) => {
        // Limpa arquivo temporário
        setTimeout(() => {
          try {
            if (tempPath && fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          } catch (_e) {}
        }, 1500);

        if (error || !stdout.includes("SUCCESS")) {
          console.error("Erro ao imprimir via WinSpool:", error?.message || stderr);
          resolve({ 
            success: false, 
            error: stderr || error?.message || "Falha ao enviar para a impressora" 
          });
        } else {
          resolve({ 
            success: true, 
            printer: targetPrinterName || "Padrao do Windows" 
          });
        }
      });
    } catch (err) {
      console.error("Erro no processamento da impressora:", err);
      if (tempPath && fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (_e) {}
      }
      resolve({ success: false, error: err.message });
    }
  });
}
