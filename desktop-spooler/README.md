# 🖨️ PedeMuleke Spooler - Módulo Desktop de Impressão Silenciosa

O **PedeMuleke Spooler** é um executável leve de segundo plano para Windows que permite ao restaurante imprimir comandas diretamente em impressoras térmicas (Epson, Elgin, Bematech, Daruma, etc.) **sem abrir caixas de diálogo do navegador** e com corte automático de bobina.

---

## 🚀 Como Funciona:
1. O executável roda localmente na máquina do restaurante ouvindo requisições seguras em `http://127.0.0.1:9100`.
2. O Painel Web do PedeMuleke detecta automaticamente quando o Spooler está ativo.
3. Quando um novo pedido entra (ou quando clica em Imprimir), o painel despacha o pedido para o Spooler, que imprime em menos de **0,2 segundos**.
4. Se o Spooler estiver fechado, o painel faz fallback transparente para a impressão normal do navegador.

---

## 🛠️ Como Testar Localmente:
1. Dê dois cliques no arquivo `iniciar-spooler.bat` (ou execute `node server.js` dentro da pasta `desktop-spooler/`).
2. Abra seu navegador em `http://127.0.0.1:9100/status` para confirmar o status `online`.
3. Para listar as impressoras instaladas no seu Windows, acesse: `http://127.0.0.1:9100/printers`.

---

## 📦 Como Gerar o Arquivo `.exe` Final:
Dê dois cliques no arquivo `build-exe.bat`. Ele gerará automaticamente o executável único `pedemuleke-spooler.exe` para distribuição aos restaurantes parceiros.
