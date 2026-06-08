# ⚡ QUICK START - Instrucciones para Próxima Sesión

## 📍 Ubicación del Proyecto
```
/Users/miguelangelortizcruz/Desktop/claude/personal-finance-dashboard
```

## 🎯 QUÉ PEDIR AL CLAUDE (próxima sesión)

**Usuario solo dirá QUÉ quiere, el Claude hará:**

1. ✅ Leer `SESSION_SUMMARY.md` en el proyecto
2. ✅ Solicitar permisos: Bash + Read/Edit/Write
3. ✅ Hacer cambios en `components/dashboard.tsx`
4. ✅ Compilar con `npm run build`
5. ✅ Dar instrucciones CLARAS para reiniciar servidor
6. ✅ **VERIFICAR** que cambios están en archivo (grep/cat)

---

## 🔄 CICLO DE TRABAJO

### Para usuario: "Quiero que [X]"
Claude hará:
```bash
# 1. Ubicar línea exacta del código a cambiar
grep -n "texto a buscar" components/dashboard.tsx

# 2. Editar con Read + Edit (con contexto)
Read: línea 100-150 (contexto)
Edit: cambio específico

# 3. Compilar
npm run build

# 4. Verificar cambio está en archivo
grep -n "nuevo código" components/dashboard.tsx

# 5. Dar instrucciones al usuario:
# "Haz: Ctrl+C, rm -rf .next, npm run build, npm run dev, Cmd+Shift+R"
```

---

## 🚨 SI USUARIO DICE "NO VEMOS LOS CAMBIOS"

**SOLO** ejecutar estas 4 cosas (en orden):

```bash
cd /Users/miguelangelortizcruz/Desktop/claude/personal-finance-dashboard

# 1. Parar servidor
# Ctrl+C en terminal

# 2. Limpiar
rm -rf .next node_modules/.cache

# 3. Reconstruir
npm run build

# 4. Iniciar
npm run dev
```

Usuario hace: `Cmd+Shift+R` (Mac) o `Ctrl+Shift+R` (Windows) - 3 veces

---

## 📁 Archivos Principales

| Archivo | Líneas | Qué tiene |
|---------|--------|-----------|
| `components/dashboard.tsx` | 4200+ | 95% de cambios, UI, lógica |
| `app/api/analyze-pdf/route.ts` | ~280 | PDF parsing, validación |
| `app/api/invoices/route.ts` | ~134 | CRUD facturas, DB mapping |
| `lib/supabase.ts` | ~27 | Cliente Supabase |

---

## 🎨 Componentes Principales en dashboard.tsx

| Nombre | Línea | Propósito |
|--------|-------|-----------|
| `showToast()` | ~286 | Notificaciones usuario |
| `resetFormData()` | ~823 | Reset form con valores por defecto |
| `openExpenseDialog()` | ~868 | Abre diálogo gasto (work + Transferencia) |
| `openIncomeDialog()` | ~849 | Abre diálogo ingreso |
| `handleAddInvoice()` | ~557 | Guardar factura (validaciones) |
| `confirmDelete()` | ~724 | Eliminar factura (con confirmación) |
| Ordenamiento | ~2083 | Sort por mes para gastos |
| `subscriptionData` | ~480 | Cuadro suscripciones (con useMemo) |

---

## ✅ CHECKLIST - Cosas que YA están hechas

- [x] Delete confirmation modal
- [x] Error toasts (no más console.log)
- [x] Financial calculations validation
- [x] Date filter validation
- [x] PDF validation (tipo + tamaño)
- [x] Session expiration (30 días)
- [x] Ordenamiento mes para gastos
- [x] Cuadro suscripciones automático
- [x] Protección múltiples clics
- [x] Valores predeterminados gasto (work + Transferencia)
- [x] Wernells en proveedores
- [x] PDFs pequeños aceptados

---

## 🔧 Comandos de Desarrollo

```bash
# Build production
npm run build

# Dev server (localhost:3000)
npm run dev

# Type check
npm run lint

# Limpiar TODO
rm -rf .next node_modules/.cache out dist && npm run build
```

---

## 💾 Git Status

**NO COMMITEAR TODAVÍA** - Usuario dijo que quiere verificar en producción primero.

---

## 🎓 Patrones Usados

- **State management**: `useState`, `useMemo`
- **Validación**: Try/catch + showToast errores
- **Optimistic UI**: Update estado antes de API
- **Rollback**: Revert si API falla
- **Async handling**: `async/await` con `.then().catch()`
- **localStorage**: Session persistence (auth_time)

---

## 📊 Stack

- **Next.js 16** (Turbopack)
- **React** (hooks)
- **TypeScript** (strict)
- **Supabase** (PostgreSQL)
- **TailwindCSS** (styling)
- **Lucide React** (icons)
- **Recharts** (gráficos)

---

## 🚀 INSTRUCCIÓN FINAL PARA PRÓXIMA SESIÓN

```
1. Lee SESSION_SUMMARY.md (entiende contexto)
2. Solicita permisos necesarios
3. Cuando usuario pida algo, busca líneas exactas
4. Haz cambios pequeños y verifica
5. Compila y VERIFICA que cambios estén en archivo
6. Instrucciones claras para reiniciar si es necesario
7. NUNCA digas "está listo" sin verificar que usuario lo ve
```

---

**¡Listo para la próxima sesión!** 🚀
