# Liberar Portas Locais — Windows

Use estes comandos quando receber `EADDRINUSE` ao tentar rodar o backend ou frontend.

---

## Porta 5000 (Backend)

**1. Ver qual processo está usando a porta:**
```cmd
netstat -ano | findstr :5000
```

Exemplo de saída:
```
TCP    0.0.0.0:5000    0.0.0.0:0    LISTENING    12345
```
O número ao final (12345) é o PID.

**2. Encerrar o processo:**
```cmd
taskkill /PID 12345 /F
```

---

## Porta 6000 (Frontend)

**1. Ver qual processo está usando a porta:**
```cmd
netstat -ano | findstr :6000
```

**2. Encerrar o processo:**
```cmd
taskkill /PID 12345 /F
```

---

## Liberar as duas portas de uma vez (script)

Execute o arquivo `kill-ports.bat` na raiz do projeto:
```cmd
kill-ports.bat
```

---

## Alternativa: usar porta diferente

Se preferir não matar o processo, rode em outra porta:

**Backend:**
```cmd
PORT=5001 npm run dev
```
E ajuste `frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:5001
```

**Frontend:**
```cmd
npx next dev -p 6001
```
