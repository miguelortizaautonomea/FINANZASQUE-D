'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import {
  Upload,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Search,
  Calendar,
  Filter,
  X,
  Trash2,
  FileUp,
  MoreVertical,
  ChevronDown,
  LayoutDashboard,
  Receipt,
  Calculator,
  Tag,
  Settings,
  Wallet,
  PiggyBank,
  Percent,
  FileText,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Sun,
  Moon,
  Plus,
  Camera,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { parseCSV } from '@/lib/csv-parser';

interface Invoice {
  id: string;
  type: 'income' | 'expense';
  category: string;
  number: string;       // Número de factura (ej: "12")
  company: string;      // Empresa (razón social)
  description?: string; // Descripción del concepto facturado
  amount: number;
  amountWithoutVAT: number;
  vat: number;
  date: string;
  fileName: string;
  method: string;
  hasInvoice?: boolean; // Si tiene factura → cuenta en contabilidad
  paid?: boolean;       // Si está pagada o no
  pdfUrl?: string | null; // URL pública del PDF en Supabase Storage
}

const CATEGORIES = ['comidas', 'caballo', 'deporte', 'work', 'ocio', 'caprichos', 'viajes', 'campo', 'regalos', 'coche', 'desayuno'];
const METHODS = ['Tarjeta', 'Efectivo', 'Transferencia', 'Bizum', 'PayPal', 'Otro'];

type ViewType = 'dashboard' | 'transactions' | 'accounting' | 'invoices-income' | 'invoices-expense' | 'subscriptions' | 'categories' | 'settings';

// Credenciales de acceso
const AUTH_EMAIL = 'miguel.ortiz@autonomea.com';
const AUTH_PASSWORD = '2714';

export default function Dashboard() {
  // Estado de autenticación
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Toast para notificaciones
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modal de confirmación para borrado
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; description: string } | null>(null);

  // Mostrar toast por 3 segundos
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Sesión con expiración (30 días)
  const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 días en ms

  // Verificar sesión guardada al cargar
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('finanzapp_auth');
      const timestamp = localStorage.getItem('finanzapp_auth_time');
      if (saved === 'authenticated' && timestamp) {
        const elapsed = Date.now() - parseInt(timestamp);
        if (elapsed < SESSION_DURATION) {
          setIsAuthenticated(true);
        } else {
          // Sesión expirada
          localStorage.removeItem('finanzapp_auth');
          localStorage.removeItem('finanzapp_auth_time');
          setIsAuthenticated(false);
        }
      }
      setAuthChecked(true);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginEmail.toLowerCase().trim() === AUTH_EMAIL && loginPassword === AUTH_PASSWORD) {
      localStorage.setItem('finanzapp_auth', 'authenticated');
      localStorage.setItem('finanzapp_auth_time', Date.now().toString()); // Guardar timestamp
      setIsAuthenticated(true);
      setLoginError('');
      setLoginEmail('');
      setLoginPassword('');
    } else {
      setLoginError('Email o contraseña incorrectos');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('finanzapp_auth');
    localStorage.removeItem('finanzapp_auth_time');
    setIsAuthenticated(false);
  };

  const [activeView, setActiveView] = useState<ViewType>('dashboard');
  // Estado para sidebar móvil
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showIncomeDialog, setShowIncomeDialog] = useState(false);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Helper: SIEMPRE devuelve el mes actual real (calculado en el momento)
  const getCurrentMonthRange = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const todayStr = now.toISOString().split('T')[0];
    return { firstDay, lastDay, todayStr };
  };

  // Filtros para gráficos y métricas (arriba) - Por defecto MES ACTUAL hasta HOY
  const _initialRange = getCurrentMonthRange();
  const _firstDay = _initialRange.firstDay;
  const _todayStr = _initialRange.todayStr;
  const [chartDateFrom, setChartDateFrom] = useState<string>(_firstDay);
  const [chartDateTo, setChartDateTo] = useState<string>(_todayStr);
  const [chartFilterType, setChartFilterType] = useState<'all' | 'income' | 'expense'>('all');

  // Filtros para tabla (abajo) - Por defecto MES ACTUAL
  const _tableRange = getCurrentMonthRange();
  const firstDayOfMonth = _tableRange.firstDay;
  const lastDayOfMonth = _tableRange.lastDay;
  const [dateFrom, setDateFrom] = useState<string>(firstDayOfMonth);
  const [dateTo, setDateTo] = useState<string>(lastDayOfMonth);

  // Validar y actualizar fechas con validación
  const setDateFromSafe = (newDate: string) => {
    if (newDate && dateTo && newDate > dateTo) {
      showToast('❌ La fecha inicial no puede ser posterior a la final', 'error');
      return;
    }
    setDateFrom(newDate);
  };

  const setDateToSafe = (newDate: string) => {
    if (newDate && dateFrom && newDate < dateFrom) {
      showToast('❌ La fecha final no puede ser anterior a la inicial', 'error');
      return;
    }
    setDateTo(newDate);
  };
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchText, setSearchText] = useState<string>('');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'>('date-desc');

  // Tipo de gráfico para categorías
  const [categoryChartType, setCategoryChartType] = useState<'bar' | 'pie'>('bar');

  // Rango de tiempo para gráfico de tendencia - Por defecto MES ACTUAL
  const [trendRange, setTrendRange] = useState<'currentMonth' | 'ytd' | '90days' | '30days'>('currentMonth');

  // Tema claro/oscuro
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Estado de refresh
  const [refreshing, setRefreshing] = useState(false);

  // Filtro de mes para vista Categorías
  const [categoryMonth, setCategoryMonth] = useState<string>('all'); // 'all' o '2026-06'

  // Ordenamiento para Fact. Ingresos y Fact. Gastos
  const [invoiceSortBy, setInvoiceSortBy] = useState<'number-asc' | 'number-desc' | 'date-asc' | 'date-desc'>('number-desc');

  // Estado para emitir nuevas facturas
  const [showIssueDialog, setShowIssueDialog] = useState(false);
  const [issueData, setIssueData] = useState({
    clientBlock: '',  // Bloque de texto con TODOS los datos del cliente
    concept: '',
    units: '1',
    pricePerUnit: '',
    hasIVA: false,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importMessage, setImportMessage] = useState<string>('');
  const [analyzingPDF, setAnalyzingPDF] = useState(false);
  const [pdfAnalysisError, setPdfAnalysisError] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    number: '',       // Número de factura
    company: '',      // Empresa
    description: '',  // Descripción del concepto
    amount: '',
    amountWithoutVAT: '',
    category: CATEGORIES[0],
    date: new Date().toISOString().split('T')[0],
    method: METHODS[0],
    ivaPercent: '21',
  });

  // Función para analizar un PDF y autorrellenar el formulario
  // Extrae: Número de factura, Importe (bruto), IVA (21% o 0%)
  // 📸 Convierte una imagen (foto de cámara) en un PDF con jsPDF
  // Usado para subir facturas desde móvil
  const convertImageToPDF = async (imageFile: File): Promise<File> => {
    const { jsPDF } = await import('jspdf');
    // Leer la imagen como dataURL
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(imageFile);
    });
    // Cargar imagen para obtener dimensiones
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });
    // Crear PDF A4 con proporción de la foto
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: img.width > img.height ? 'landscape' : 'portrait' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;
    // Calcular dimensiones manteniendo proporción
    const ratio = Math.min(maxW / img.width, maxH / img.height);
    const w = img.width * ratio;
    const h = img.height * ratio;
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    // Detectar tipo de imagen
    const imgType = imageFile.type.includes('png') ? 'PNG' : 'JPEG';
    pdf.addImage(dataUrl, imgType, x, y, w, h);
    const blob = pdf.output('blob');
    const baseName = imageFile.name.replace(/\.(jpg|jpeg|png|heic|webp)$/i, '');
    return new File([blob], `${baseName}.pdf`, { type: 'application/pdf' });
  };

  // 📸 Handler para cuando el usuario selecciona una FOTO desde el modal
  const handlePhotoUpload = async (file: File, type: 'income' | 'expense') => {
    setAnalyzingPDF(true);
    setPdfAnalysisError('');
    try {
      // Convertir foto a PDF
      const pdfFile = await convertImageToPDF(file);
      // Procesar como un PDF normal
      await analyzePDF(pdfFile, type);
    } catch (e: any) {
      setPdfAnalysisError('Error procesando la foto: ' + (e.message || 'desconocido'));
      setAnalyzingPDF(false);
    }
  };

  const analyzePDF = async (file: File, type: 'income' | 'expense') => {
    setAnalyzingPDF(true);
    setPdfAnalysisError('');
    try {
      const fd = new FormData();
      fd.append('file', file);

      const response = await fetch('/api/analyze-pdf', {
        method: 'POST',
        body: fd,
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        // Mensaje más amigable para PDFs escaneados o muy pequeños
        let errorMsg = result.error || 'Error al analizar el PDF';

        if (result.error?.includes('PDF escaneado') || result.error?.includes('muy pequeño')) {
          errorMsg = '📄 PDF pequeño detectado - Completa los datos manualmente a continuación';
        }

        setPdfAnalysisError(errorMsg);
        // Aceptar el archivo de todas formas para que el usuario pueda llenar manualmente
        setSelectedFile(file);
        showToast('ℹ️ ' + errorMsg, 'error');
        return;
      }

      const data = result.data;

      // Auto-rellenar: nº factura, empresa, descripción, monto, IVA
      setFormData((prev) => ({
        ...prev,
        number: data.invoiceNumber || prev.number,
        company: data.company || prev.company,
        description: data.description || prev.description,
        amount: data.amount?.toString() || prev.amount,
        amountWithoutVAT: data.amountWithoutVAT?.toString() || prev.amountWithoutVAT,
        ivaPercent: data.ivaPercent !== undefined ? data.ivaPercent.toString() : '21',
      }));

      // Activar el toggle "Tiene factura" automáticamente
      setSelectedFile(file);
      showToast('✅ PDF analizado correctamente', 'success');
    } catch (error: any) {
      // Error de red o parsing
      const errorMsg = error.message || 'Error al analizar el PDF';
      setPdfAnalysisError(errorMsg);
      setSelectedFile(file); // Aceptar archivo para entrada manual
      showToast('⚠️ ' + errorMsg, 'error');
    } finally {
      setAnalyzingPDF(false);
    }
  };

  // Función para refrescar/cargar datos
  const loadInvoices = async () => {
    try {
      setRefreshing(true);
      const response = await fetch('/api/invoices');
      const data = await response.json();
      if (data.invoices) {
        setInvoices(data.invoices);
      } else if (data.error) {
        showToast('❌ Error: ' + data.error, 'error');
      }
    } catch (error: any) {
      console.error('Error loading invoices:', error);
      showToast('❌ Error al cargar facturas. Revisa tu conexión.', 'error');
    } finally {
      setLoading(false);
      setTimeout(() => setRefreshing(false), 500);
    }
  };

  // Load invoices from API on mount
  useEffect(() => {
    const loadInvoicesInitial = async () => {
      try {
        const response = await fetch('/api/invoices');
        const data = await response.json();
        if (data.invoices) {
          setInvoices(data.invoices);
        }
      } catch (error) {
        console.error('Error loading invoices:', error);
      } finally {
        setLoading(false);
      }
    };

    loadInvoicesInitial();
  }, []);

  // Filtered data for CHARTS (top section)
  const chartFilteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const typeMatch = chartFilterType === 'all' || inv.type === chartFilterType;
      const dateMatch = (!chartDateFrom || inv.date >= chartDateFrom) && (!chartDateTo || inv.date <= chartDateTo);
      return typeMatch && dateMatch;
    });
  }, [invoices, chartFilterType, chartDateFrom, chartDateTo]);

  // Filtered data for TABLE (bottom section) with search and sorting
  const filteredInvoices = useMemo(() => {
    let filtered = invoices.filter((inv) => {
      const typeMatch = filterType === 'all' || inv.type === filterType;
      const categoryMatch = filterCategory === 'all' || inv.category === filterCategory;
      const dateMatch = (!dateFrom || inv.date >= dateFrom) && (!dateTo || inv.date <= dateTo);

      const searchLower = searchText.toLowerCase();
      const searchMatch = !searchText ||
        inv.company.toLowerCase().includes(searchLower) ||
        inv.number.toLowerCase().includes(searchLower) ||
        inv.category.toLowerCase().includes(searchLower);

      return typeMatch && categoryMatch && searchMatch && dateMatch;
    });

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        case 'date-asc':
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'amount-desc':
          return b.amount - a.amount;
        case 'amount-asc':
          return a.amount - b.amount;
        default:
          return 0;
      }
    });

    return filtered;
  }, [invoices, filterType, filterCategory, searchText, dateFrom, dateTo, sortBy]);

  // Metrics for CHARTS section (using chart filters)
  const chartMetrics = useMemo(() => {
    const chartIncome = chartFilteredInvoices.filter((i) => i.type === 'income');
    const chartExpenses = chartFilteredInvoices.filter((i) => i.type === 'expense');

    const income = chartIncome.reduce((sum, i) => sum + i.amount, 0);
    const expenses = chartExpenses.reduce((sum, i) => sum + i.amount, 0);
    const balance = income - expenses;

    return {
      totalIncome: income,
      totalExpenses: expenses,
      totalBalance: balance,
      incomeCount: chartIncome.length,
      expenseCount: chartExpenses.length,
    };
  }, [chartFilteredInvoices]);

  // Metrics for TABLE section (using table filters)
  const metrics = useMemo(() => {
    const filteredIncome = filteredInvoices.filter((i) => i.type === 'income');
    const filteredExpenses = filteredInvoices.filter((i) => i.type === 'expense');

    const income = filteredIncome.reduce((sum, i) => sum + i.amount, 0);
    const expenses = filteredExpenses.reduce((sum, i) => sum + i.amount, 0);
    const balance = income - expenses;

    const allTimeIncome = invoices.filter((i) => i.type === 'income').reduce((sum, i) => sum + i.amount, 0);
    const allTimeExpenses = invoices.filter((i) => i.type === 'expense').reduce((sum, i) => sum + i.amount, 0);

    return {
      totalIncome: income,
      totalExpenses: expenses,
      totalBalance: balance,
      incomeCount: filteredIncome.length,
      expenseCount: filteredExpenses.length,
      allTimeIncome,
      allTimeExpenses,
    };
  }, [filteredInvoices, invoices]);

  const monthlyTrend = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // "Mes" y "30 días": agrupación diaria
    if (trendRange === 'currentMonth' || trendRange === '30days') {
      let startDate: Date;
      if (trendRange === 'currentMonth') {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      } else {
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 29);
      }
      const startDateStr = startDate.toISOString().split('T')[0];

      // Pre-poblar todos los días con 0
      const days = new Map<string, { income: number; expenses: number }>();
      const cursor = new Date(startDate);
      while (cursor <= today) {
        days.set(cursor.toISOString().split('T')[0], { income: 0, expenses: 0 });
        cursor.setDate(cursor.getDate() + 1);
      }

      invoices.forEach((inv) => {
        if (inv.date >= startDateStr && inv.date <= todayStr && days.has(inv.date)) {
          const d = days.get(inv.date)!;
          if (inv.type === 'income') d.income += inv.amount;
          else d.expenses += inv.amount;
        }
      });

      return Array.from(days.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({
          month: trendRange === 'currentMonth'
            ? date.slice(8)              // "01", "02" … día del mes
            : `${date.slice(8)}/${date.slice(5, 7)}`, // "DD/MM"
          income: Math.round(data.income * 100) / 100,
          expenses: Math.round(data.expenses * 100) / 100,
        }));
    }

    // "90 días" y "Año": agrupación mensual (sin cambios)
    let startDateStr: string;
    if (trendRange === '90days') {
      const d = new Date(today);
      d.setDate(d.getDate() - 90);
      startDateStr = d.toISOString().split('T')[0];
    } else {
      startDateStr = `${today.getFullYear()}-01-01`;
    }

    const months = new Map<string, { income: number; expenses: number }>();
    invoices.forEach((inv) => {
      if (inv.date >= startDateStr) {
        const monthKey = inv.date.slice(0, 7);
        if (!months.has(monthKey)) months.set(monthKey, { income: 0, expenses: 0 });
        const monthData = months.get(monthKey)!;
        if (inv.type === 'income') monthData.income += inv.amount;
        else monthData.expenses += inv.amount;
      }
    });

    return Array.from(months.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month: month.slice(5),
        income: Math.round(data.income * 100) / 100,
        expenses: Math.round(data.expenses * 100) / 100,
      }));
  }, [invoices, trendRange]);

  const categoryExpenses = useMemo(() => {
    const categories = new Map<string, number>();

    chartFilteredInvoices
      .filter((inv) => inv.type === 'expense')
      .forEach((inv) => {
        const current = categories.get(inv.category) || 0;
        categories.set(inv.category, current + inv.amount);
      });

    return Array.from(categories.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [chartFilteredInvoices]);

  // Cálculo de suscripciones con useMemo para actualizarse automáticamente
  const subscriptionData = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const minDate = `${currentYear}-04-01`;
    const expenseInvoices = invoices.filter(i =>
      i.type === 'expense' &&
      i.hasInvoice === true &&
      i.date >= minDate
    );

    const months = ['04', '05', '06', '07', '08', '09', '10', '11', '12'];
    const monthNames = {
      '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
      '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
      '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre'
    };

    // Proveedores fijos
    const PROVIDERS = [
      { display: 'ChatGPT', aliases: ['chatgpt', 'openai'] },
      { display: 'N8N', aliases: ['n8n', 'railway'] },
      { display: 'Verificado Meta', aliases: ['verificado meta', 'meta verified', 'meta'] },
      { display: 'GHL Agency', aliases: ['ghl', 'gohighlevel', 'high level', 'highlevel'] },
      { display: 'Google Workspace', aliases: ['google workspace', 'g.workspace', 'gworkspace', 'workspace'] },
      { display: 'Smartlead', aliases: ['smartlead'] },
      { display: 'Mailerlite', aliases: ['mailerlite', 'mailer lite'] },
      { display: 'Claude', aliases: ['claude', 'anthropic'] },
      { display: 'Slack', aliases: ['slack'] },
      { display: 'Stripe', aliases: ['stripe'] },
      { display: 'Wernells', aliases: ['wernells'] },
      { display: 'MillionVerifier', aliases: ['millionverifier', 'million verifier', 'million verified'] },
    ];

    // Agrupar facturas
    const grouped: Record<string, Record<string, { total: number; count: number; invoices: Invoice[] }>> = {};
    for (const p of PROVIDERS) {
      grouped[p.display] = {};
    }

    for (const inv of expenseInvoices) {
      const companyLower = inv.company.toLowerCase();
      const month = inv.date.slice(5, 7);
      if (!months.includes(month)) continue;

      for (const p of PROVIDERS) {
        if (p.aliases.some(a => companyLower.includes(a))) {
          if (!grouped[p.display][month]) grouped[p.display][month] = { total: 0, count: 0, invoices: [] };
          grouped[p.display][month].total += inv.amount;
          grouped[p.display][month].count += 1;
          grouped[p.display][month].invoices.push(inv);
          break;
        }
      }
    }

    const companies = PROVIDERS.map(p => p.display);
    const recurrent = companies.filter(c => Object.keys(grouped[c]).length >= 2);

    const monthTotals: Record<string, number> = {};
    for (const m of months) {
      monthTotals[m] = PROVIDERS.reduce((sum, p) => {
        return sum + (grouped[p.display][m]?.total || 0);
      }, 0);
    }

    const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');

    return {
      expenseInvoices,
      months,
      monthNames,
      grouped,
      companies,
      recurrent,
      monthTotals,
      currentMonth,
    };
  }, [invoices]);

  const handleAddInvoice = async (type: 'income' | 'expense') => {
    // Prevenir múltiples clics
    if (isSaving) {
      showToast('⏳ Por favor espera, la factura se está guardando...', 'error');
      return;
    }

    // Validación: Monto requerido
    if (!formData.amount || formData.amount.trim() === '') {
      showToast('❌ Por favor introduce el Monto', 'error');
      return;
    }

    const amount = parseFloat(formData.amount);
    // Validar que sea un número válido y positivo
    if (isNaN(amount) || amount <= 0) {
      showToast('❌ El Monto debe ser un número positivo', 'error');
      return;
    }

    // Validación: Empresa o Descripción requerida
    if (!formData.company && !formData.description) {
      showToast('❌ Por favor introduce al menos Empresa o Descripción', 'error');
      return;
    }

    // Validación: Fecha válida
    if (!formData.date) {
      showToast('❌ Por favor selecciona una Fecha', 'error');
      return;
    }

    setIsSaving(true);

    const hasInvoice = !!selectedFile;

    // Si tiene factura → calcular IVA basado en el porcentaje seleccionado
    let amountWithoutVAT = amount;
    let vat = 0;

    if (hasInvoice) {
      const ivaPercent = parseFloat(formData.ivaPercent || '0');
      if (ivaPercent < 0 || ivaPercent > 100) {
        showToast('❌ El IVA debe estar entre 0 y 100%', 'error');
        setIsSaving(false);
        return;
      }
      // Prevenir división por cero: Si ivaPercent es 0, los cálculos siguen siendo válidos
      amountWithoutVAT = ivaPercent > 0 ? amount / (1 + ivaPercent / 100) : amount;
      vat = ivaPercent > 0 ? Math.round((amount - amountWithoutVAT) * 100) / 100 : 0; // Redondear a 2 decimales
    }

    // Si solo introdujo Descripción pero no Empresa, usar la Descripción como Empresa
    const companyFinal = formData.company || formData.description || 'Sin nombre';

    // 🤖 AUTO-NUMERACIÓN para facturas de GASTO
    // SIEMPRE auto-generamos el número para gastos (formato "N-Mes" ej: "1-Jun")
    // El usuario no debe poder ponerlo manualmente
    let finalNumber = formData.number;
    if (type === 'expense') {
      // Para gastos siempre auto-generar (ignoramos lo que haya en formData.number)
      finalNumber = getNextExpenseNumber(formData.date);
    } else if (!finalNumber) {
      finalNumber = `MAN-${Date.now()}`;
    }

    const newInvoice: Invoice = {
      id: Date.now().toString(),
      type,
      // Usar la categoría que el usuario seleccionó (por defecto viene preseleccionada según tipo)
      category: formData.category || (type === 'income' ? 'work' : CATEGORIES[0]),
      number: finalNumber,
      company: companyFinal,
      description: formData.description || undefined,
      amount,
      amountWithoutVAT,
      vat,
      date: formData.date,
      fileName: selectedFile?.name || 'manual',
      // Usar el método que el usuario seleccionó (por defecto viene preseleccionado según tipo)
      method: formData.method || (type === 'income' ? 'Transferencia' : METHODS[0]),
      hasInvoice,
    };

    // Optimistic update
    setInvoices([newInvoice, ...invoices]);

    // Persistir en Supabase
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newInvoice),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error desconocido');
      }
      showToast('✅ Factura añadida correctamente', 'success');
    } catch (e: any) {
      console.error('Error creating invoice:', e);
      // Deshacer optimistic update
      setInvoices(invoices);
      showToast('❌ Error al guardar: ' + (e.message || 'Intenta de nuevo'), 'error');
      setIsSaving(false);
      return;
    }

    // 📤 SIEMPRE: Si hay PDF REAL adjunto (no el dummy), subir a Supabase Storage
    if (selectedFile && selectedFile.size > 0) {
      try {
        // Validar PDF antes de subir
        if (!selectedFile.type.includes('pdf')) {
          showToast('❌ El archivo debe ser un PDF', 'error');
          setIsSaving(false);
          return;
        }
        if (selectedFile.size > 10 * 1024 * 1024) { // 10MB máximo
          showToast('❌ El PDF no puede pesar más de 10MB', 'error');
          setIsSaving(false);
          return;
        }

        // Generar nombre estandarizado
        const monthMap: Record<string, string> = {
          '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
          '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
          '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic'
        };
        const monthShort = monthMap[newInvoice.date.slice(5, 7)] || 'Sin';
        const cleanCompany = companyFinal.replace(/[^a-zA-Z0-9\s\-]/g, '').trim().substring(0, 50);
        const pdfFileName = `${monthShort}-${newInvoice.number || 'X'}-${cleanCompany}.pdf`;

        const uploadFormData = new FormData();
        uploadFormData.append('file', selectedFile, pdfFileName);
        uploadFormData.append('fileName', pdfFileName);
        uploadFormData.append('invoiceId', newInvoice.id);

        const uploadResponse = await fetch('/api/upload-pdf', {
          method: 'POST',
          body: uploadFormData,
        });
        const uploadResult = await uploadResponse.json();
        if (uploadResult.success && uploadResult.url) {
          // Actualizar el invoice en memoria con la URL
          newInvoice.pdfUrl = uploadResult.url;
          setInvoices(prev => prev.map(i => i.id === newInvoice.id ? { ...i, pdfUrl: uploadResult.url } : i));
        } else {
          showToast('⚠️ Factura guardada pero PDF no se subió: ' + (uploadResult.error || 'Error desconocido'), 'error');
        }
      } catch (uploadErr: any) {
        console.error('Error en upload PDF:', uploadErr);
        showToast('⚠️ Factura guardada pero error en PDF: ' + (uploadErr.message || 'Intenta de nuevo'), 'error');
      }
    }

    // 🚀 OPCIONAL: También subir a Google Drive vía n8n webhook (si está configurado)
    const driveWebhook = process.env.NEXT_PUBLIC_DRIVE_WEBHOOK_EXPENSES;
    if (type === 'expense' && selectedFile && selectedFile.size > 0 && driveWebhook) {
      try {
        const cleanCompany = companyFinal.replace(/[^a-zA-Z0-9\s\-]/g, '').trim().substring(0, 50);
        // newInvoice.number viene en formato "N-Mes" (ej: "21-Jun")
        // Invertimos a "Mes-N" para el nombre del archivo: "Jun-21-Empresa.pdf"
        const numMatch = newInvoice.number?.match(/^(\d+)-(\w+)$/);
        const flippedNumber = numMatch ? `${numMatch[2]}-${numMatch[1]}` : newInvoice.number;
        const driveFileName = `${flippedNumber}-${cleanCompany}.pdf`;

        const driveFormData = new FormData();
        driveFormData.append('file', selectedFile, driveFileName);
        driveFormData.append('fileName', driveFileName);
        driveFormData.append('company', companyFinal);
        driveFormData.append('amount', amount.toFixed(2));

        fetch(driveWebhook, {
          method: 'POST',
          body: driveFormData,
        }).then(() => {
          console.log('✅ PDF subido a Drive');
        }).catch(err => {
          console.error('Drive upload error:', err);
        });
      } catch (driveErr) {
        console.error('Error preparing Drive upload:', driveErr);
      }
    }

    // Limpiar formulario y cerrar diálogo
    resetFormData(type);
    if (type === 'income') {
      setShowIncomeDialog(false);
    } else {
      setShowExpenseDialog(false);
    }
    setIsSaving(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = parseCSV(text);

      if (parsed.length === 0) {
        setImportMessage('❌ No se encontraron registros válidos en el CSV');
        return;
      }

      const newInvoices = parsed.map((p) => ({
        ...p,
        id: `${Date.now()}_${Math.random()}`,
      }));

      setInvoices([...invoices, ...newInvoices]);
      setImportMessage(`✅ ${newInvoices.length} facturas importadas exitosamente`);

      setTimeout(() => {
        setShowImportDialog(false);
        setImportMessage('');
      }, 2000);
    } catch (error) {
      setImportMessage('❌ Error al procesar el archivo. Verifica que sea un CSV válido.');
    }
  };

  // Mostrar modal de confirmación para borrado
  const deleteInvoice = async (id: string) => {
    const invoice = invoices.find(i => i.id === id);
    if (!invoice) return;
    setDeleteConfirm({
      id,
      description: `${invoice.number} - ${invoice.company} por €${invoice.amount.toFixed(2)}`
    });
  };

  // Confirmar borrado (después de modal)
  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const id = deleteConfirm.id;

    // Optimistic update
    setInvoices(invoices.filter((inv) => inv.id !== id));
    setDeleteConfirm(null);

    // Persistir en Supabase
    try {
      const res = await fetch(`/api/invoices?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
      showToast('✅ Factura eliminada correctamente', 'success');
    } catch (e: any) {
      // Deshacer optimistic update si falla
      await loadInvoices();
      showToast('❌ Error al eliminar: ' + (e.message || 'Intenta de nuevo'), 'error');
    }
  };

  // Función para resetear el formulario con valores por defecto según tipo
  const resetFormData = (type: 'income' | 'expense') => {
    // Establecer valores por defecto según tipo
    let defaultCategory = CATEGORIES[0];
    let defaultMethod = METHODS[0];

    // Para gastos: SIEMPRE work y Transferencia
    if (type === 'expense') {
      defaultCategory = 'work';
      defaultMethod = 'Transferencia';
    }

    setFormData({
      number: '',
      company: '',
      amount: '',
      amountWithoutVAT: '',
      description: '',
      category: defaultCategory,
      date: new Date().toISOString().split('T')[0],
      method: defaultMethod,
      ivaPercent: '21',
    });
    setSelectedFile(null);
    setPdfAnalysisError('');
  };

  // Funciones para abrir diálogos con formulario reiniciado
  /**
   * Abre el modal de INGRESO.
   * Defaults editables: category='work', method='Transferencia' (típicos para ingresos)
   * @param hasInvoiceDefault - true si viene de "Fact. Ingresos" (= con factura)
   *                            false si viene de Dashboard/Transacciones (= sin factura)
   */
  const openIncomeDialog = (hasInvoiceDefault: boolean = false) => {
    setFormData({
      number: '',
      company: '',
      amount: '',
      amountWithoutVAT: '',
      description: '',
      category: 'work', // ← Preseleccionado pero EDITABLE
      date: new Date().toISOString().split('T')[0],
      method: 'Transferencia', // ← Preseleccionado pero EDITABLE
      ivaPercent: '21',
    });
    // Si viene de Fact. Ingresos → toggle de factura activo (placeholder File)
    // Si viene de Dashboard/Transacciones → toggle desactivado
    setSelectedFile(hasInvoiceDefault ? new File([], 'manual') : null);
    setPdfAnalysisError('');
    setShowIncomeDialog(true);
  };

  /**
   * Abre el modal de GASTO.
   * Defaults editables: category='work', method='Transferencia'
   * @param hasInvoiceDefault - true si viene de "Fact. Gastos" (= con factura)
   *                            false si viene de Dashboard/Transacciones (= sin factura)
   */
  const openExpenseDialog = (hasInvoiceDefault: boolean = false) => {
    setFormData({
      number: '',
      company: '',
      amount: '',
      amountWithoutVAT: '',
      description: '',
      category: 'work', // ← Preseleccionado pero EDITABLE
      date: new Date().toISOString().split('T')[0],
      method: 'Transferencia', // ← Preseleccionado pero EDITABLE
      ivaPercent: '21',
    });
    setSelectedFile(hasInvoiceDefault ? new File([], 'manual') : null);
    setPdfAnalysisError('');
    setShowExpenseDialog(true);
  };

  const toggleInvoice = async (id: string) => {
    const invoice = invoices.find(i => i.id === id);
    if (!invoice) return;
    const updated = { ...invoice, hasInvoice: !invoice.hasInvoice };
    // Optimistic update
    setInvoices(invoices.map((inv) => inv.id === id ? updated : inv));
    // Persistir en Supabase
    try {
      await fetch('/api/invoices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
    } catch (e) {
      console.error('Error toggling invoice:', e);
    }
  };

  // Calcula el siguiente número de factura disponible (INGRESOS - emisión)
  const getNextInvoiceNumber = () => {
    const currentYear = new Date().getFullYear();
    const issuedNumbers = invoices
      .filter(i => i.type === 'income' && i.hasInvoice)
      .map(i => parseInt(i.number))
      .filter(n => !isNaN(n) && n > 0 && n < 1000);

    const maxNumber = issuedNumbers.length > 0 ? Math.max(...issuedNumbers) : 0;
    return maxNumber + 1;
  };

  // Auto-genera número para facturas de GASTO con formato "N-Mes"
  // Ej: "1-Jun", "2-Jun", "3-Jun"...
  const getNextExpenseNumber = (dateString: string): string => {
    const dateObj = new Date(dateString);
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth() + 1;
    const monthMap: Record<number, string> = {
      1: 'Ene', 2: 'Feb', 3: 'Mar', 4: 'Abr',
      5: 'May', 6: 'Jun', 7: 'Jul', 8: 'Ago',
      9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dic'
    };
    const monthShort = monthMap[month];
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

    // Buscar facturas de gasto con factura del mismo mes
    const monthInvoices = invoices.filter(inv =>
      inv.type === 'expense' &&
      inv.hasInvoice &&
      inv.date.startsWith(monthPrefix)
    );

    // Encontrar el mayor número que ya exista con formato "N-MonthShort"
    let maxNum = 0;
    for (const inv of monthInvoices) {
      const match = inv.number?.match(/^(\d+)-/);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxNum) maxNum = num;
      }
    }

    return `${maxNum + 1}-${monthShort}`;
  };

  // Parser inteligente del bloque del cliente
  // Devuelve { name: primera línea, htmlLines: HTML con todas las líneas restantes, country: país detectado }
  const parseClientBlock = (block: string) => {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return { name: 'Cliente', htmlLines: '', country: '' };
    const name = lines[0];
    const restLines = lines.slice(1);
    const htmlLines = restLines.map(l => `<div>${l}</div>`).join('');

    // 🌍 Detectar país del cliente (para la leyenda fiscal)
    // Lista de países comunes en operaciones extracomunitarias
    const COUNTRIES = [
      'Andorra', 'Estados Unidos', 'USA', 'United States', 'Reino Unido', 'United Kingdom', 'UK',
      'Suiza', 'Switzerland', 'Emiratos Árabes Unidos', 'Emirates', 'Dubai', 'Dubái', 'UAE', 'EAU',
      'Mónaco', 'Monaco', 'San Marino', 'Liechtenstein', 'Noruega', 'Norway', 'Islandia', 'Iceland',
      'Canadá', 'Canada', 'México', 'Mexico', 'Argentina', 'Chile', 'Colombia', 'Perú', 'Peru',
      'Brasil', 'Brazil', 'Japón', 'Japan', 'China', 'India', 'Singapur', 'Singapore',
      'Australia', 'Nueva Zelanda', 'New Zealand', 'Sudáfrica', 'South Africa',
      'Israel', 'Turquía', 'Turkey', 'Rusia', 'Russia', 'Ucrania', 'Ukraine'
    ];
    let country = '';
    // Buscar en todas las líneas (case insensitive)
    const blockLower = block.toLowerCase();
    for (const c of COUNTRIES) {
      if (blockLower.includes(c.toLowerCase())) {
        country = c;
        break;
      }
    }
    // Si no encontró ninguno conocido y hay más de 1 línea, asumir que la última línea es el país
    if (!country && restLines.length > 0) {
      const lastLine = restLines[restLines.length - 1];
      // Solo si la última línea parece un país (corta, sin números, sin "Calle"/"NIF"/etc)
      if (lastLine.length >= 3 && lastLine.length <= 40 &&
          !/^\d/.test(lastLine) &&
          !/calle|avenida|nif|fiscal|cif|email|tel/i.test(lastLine)) {
        country = lastLine;
      }
    }

    return { name, htmlLines, country };
  };

  // Genera el HTML moderno de la factura emitida
  const generateInvoiceHTML = (data: typeof issueData, invoiceNumber: string, date: string) => {
    const units = parseFloat(data.units) || 1;
    const pricePerUnit = parseFloat(data.pricePerUnit) || 0;
    const subtotal = units * pricePerUnit;
    const iva = data.hasIVA ? subtotal * 0.21 : 0;
    const total = subtotal + iva;
    const formatEUR = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

    const dateFormatted = new Date(date).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
    const clientInfo = parseClientBlock(data.clientBlock);

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Factura ${invoiceNumber} - ${clientInfo.name}</title>
<style>
  @page { size: A4; margin: 15mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    font-family: -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    background: #ffffff;
    color: #1a1a1a;
    line-height: 1.5;
    font-size: 11pt;
  }
  body { padding: 0; }
  .invoice { width: 100%; max-width: 100%; padding: 0; background: #ffffff; }

  /* HEADER */
  .header {
    display: table;
    width: 100%;
    border-bottom: 3px solid #1e40af;
    padding-bottom: 18px;
    margin-bottom: 26px;
  }
  .header-left, .header-right { display: table-cell; vertical-align: top; }
  .header-right { text-align: right; }
  .company-name {
    font-size: 22pt;
    font-weight: 800;
    color: #1e40af;
    letter-spacing: -0.5px;
    margin-bottom: 6px;
  }
  .company-info {
    font-size: 9pt;
    color: #4a4a4a;
    line-height: 1.6;
  }
  .invoice-label {
    font-size: 9pt;
    color: #6b7280;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 4px;
  }
  .invoice-number {
    font-size: 24pt;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -1px;
    margin-bottom: 6px;
  }
  .invoice-date {
    font-size: 10pt;
    color: #4a4a4a;
    font-weight: 500;
  }

  /* CLIENT */
  .section-title {
    font-size: 9pt;
    color: #1e40af;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid #e5e7eb;
  }
  .client-block {
    margin-bottom: 28px;
    padding: 14px 18px;
    border-left: 4px solid #1e40af;
    background: #f8fafc;
  }
  .client-name {
    font-size: 13pt;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 4px;
  }
  .client-info {
    font-size: 10pt;
    color: #4a4a4a;
    line-height: 1.6;
  }

  /* ITEMS TABLE */
  table.items {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 24px;
  }
  table.items thead th {
    text-align: left;
    padding: 10px 12px;
    font-size: 9pt;
    font-weight: 700;
    color: #ffffff;
    background: #1e40af;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    border: 1px solid #1e40af;
  }
  table.items thead th.num { text-align: right; }
  table.items tbody td {
    padding: 12px;
    font-size: 10pt;
    color: #1a1a1a;
    border: 1px solid #e5e7eb;
    vertical-align: top;
  }
  table.items tbody td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  table.items tbody td.desc { font-weight: 500; }

  /* TOTALS */
  .totals-wrapper {
    width: 100%;
    margin-bottom: 26px;
  }
  table.totals {
    margin-left: auto;
    width: 280px;
    border-collapse: collapse;
  }
  table.totals td {
    padding: 8px 12px;
    font-size: 10pt;
    border-bottom: 1px solid #e5e7eb;
  }
  table.totals td.label { color: #4a4a4a; }
  table.totals td.value { text-align: right; font-weight: 600; color: #1a1a1a; font-variant-numeric: tabular-nums; }
  table.totals tr.grand-total td {
    border-top: 2px solid #1e40af;
    border-bottom: 2px solid #1e40af;
    padding: 12px;
    font-size: 13pt;
    font-weight: 800;
    color: #1e40af;
    background: #eff6ff;
  }

  /* PAYMENT INFO */
  .payment {
    border: 2px solid #1e40af;
    padding: 14px 18px;
    margin-bottom: 22px;
  }
  .payment-label {
    font-size: 9pt;
    color: #1e40af;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .payment-text {
    font-size: 10pt;
    color: #1a1a1a;
    line-height: 1.6;
  }
  .iban {
    display: inline-block;
    font-family: 'Courier New', monospace;
    font-size: 11pt;
    font-weight: 700;
    color: #1e40af;
    padding: 4px 10px;
    border: 1px solid #1e40af;
    margin-top: 6px;
    letter-spacing: 1px;
  }

  /* LEGAL */
  .legal {
    margin-top: 20px;
    padding-top: 12px;
    border-top: 1px solid #e5e7eb;
    font-size: 8.5pt;
    color: #6b7280;
    line-height: 1.5;
    text-align: center;
  }
  .legal strong { color: #1e40af; }

  @media print {
    @page { size: A4; margin: 15mm; }
    body { padding: 0; background: white; }
    .invoice { box-shadow: none; }
  }
</style>
</head>
<body>
<div class="invoice">

  <div class="header">
    <div class="header-left">
      <div class="company-name">Miguel Ángel Ortiz Cruz</div>
      <div class="company-info">
        NIF: 49549728T<br>
        Calle Alemania 55<br>
        21110 Aljaraque (Huelva), España<br>
        miguelortizpersonal12@gmail.com
      </div>
    </div>
    <div class="header-right">
      <div class="invoice-label">Factura</div>
      <div class="invoice-number">Nº ${invoiceNumber}</div>
      <div class="invoice-date">${dateFormatted}</div>
    </div>
  </div>

  <div class="section-title">Facturar a</div>
  <div class="client-block">
    <div class="client-name">${clientInfo.name}</div>
    <div class="client-info">${clientInfo.htmlLines}</div>
  </div>

  <div class="section-title">Conceptos</div>
  <table class="items">
    <thead>
      <tr>
        <th style="width: 55%;">Descripción</th>
        <th class="num" style="width: 10%;">Uds.</th>
        <th class="num" style="width: 17.5%;">Precio Unit.</th>
        <th class="num" style="width: 17.5%;">Total</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="desc">${data.concept}</td>
        <td class="num">${units}</td>
        <td class="num">${formatEUR(pricePerUnit)}</td>
        <td class="num">${formatEUR(units * pricePerUnit)}</td>
      </tr>
    </tbody>
  </table>

  <div class="totals-wrapper">
    <table class="totals">
      <tr>
        <td class="label">Base imponible</td>
        <td class="value">${formatEUR(subtotal)}</td>
      </tr>
      <tr>
        <td class="label">IVA (${data.hasIVA ? '21' : '0'}%)</td>
        <td class="value">${formatEUR(iva)}</td>
      </tr>
      <tr class="grand-total">
        <td>TOTAL A PAGAR</td>
        <td style="text-align: right;">${formatEUR(total)}</td>
      </tr>
    </table>
  </div>

  <div class="payment">
    <div class="payment-label">Forma de pago</div>
    <div class="payment-text">
      Transferencia bancaria al siguiente IBAN:<br>
      <span class="iban">ES82 2100 7144 1902 0012 5905</span>
    </div>
  </div>

  <div class="legal">
    <strong>Forma de pago:</strong> Transferencia bancaria al IBAN indicado.<br><br>
    ${data.hasIVA
      ? `Factura emitida con IVA 21 % según régimen general de autónomos en España.<br><br>`
      : `<strong>OPERACIÓN EXTRACOMUNITARIA</strong> "NO SUJETA A IVA POR EL ART. 69 y 70 DE LA LEY 37/92 DEL IVA"<br><br>`
    }
    Esta factura ha sido generada electrónicamente · Conserve este documento como justificante
  </div>

</div>
</body>
</html>`;
  };

  // Emitir nueva factura: guarda en Supabase como pendiente y abre PDF en nueva ventana
  const handleIssueInvoice = async () => {
    if (!issueData.clientBlock.trim() || !issueData.concept || !issueData.pricePerUnit) {
      alert('Por favor completa: Datos del Cliente, Concepto y Precio');
      return;
    }

    const clientInfo = parseClientBlock(issueData.clientBlock);

    const units = parseFloat(issueData.units) || 1;
    const pricePerUnit = parseFloat(issueData.pricePerUnit);
    const subtotal = units * pricePerUnit;
    const iva = issueData.hasIVA ? subtotal * 0.21 : 0;
    const total = subtotal + iva;

    const nextNumber = getNextInvoiceNumber();
    const year = new Date().getFullYear();
    const invoiceFullNumber = `${String(nextNumber).padStart(3, '0')}-${year}`;
    const today = new Date().toISOString().split('T')[0];

    // Crear el invoice en Supabase
    const newInvoice: Invoice = {
      id: `emitida_${nextNumber}_${Date.now()}`,
      type: 'income',
      category: 'work',
      number: String(nextNumber),
      company: clientInfo.name,
      description: issueData.concept,
      amount: total,
      amountWithoutVAT: subtotal,
      vat: iva,
      date: today,
      fileName: `Factura ${invoiceFullNumber} - ${clientInfo.name}.pdf`,
      method: 'Transferencia',
      hasInvoice: true,
      paid: false, // EMITIDA PERO PENDIENTE DE COBRO
    };

    // Optimistic update
    setInvoices([newInvoice, ...invoices]);

    // Guardar en Supabase
    try {
      await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newInvoice),
      });
    } catch (e) {
      console.error('Error creando factura:', e);
    }

    // 📄 GENERAR PDF NATIVO CON jsPDF (no HTML, PDF de verdad)
    // Nombre del archivo: {númeroFactura}-{Mes}-{Empresa}.pdf
    // Ejemplo: "029-Jun-RacksLabs.pdf"
    const monthMap: Record<string, string> = {
      '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
      '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
      '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic'
    };
    const monthShort = monthMap[today.slice(5, 7)] || 'Sin';
    const numberOnly = String(nextNumber).padStart(3, '0');
    const cleanCompanyName = clientInfo.name
      .replace(/[^a-zA-Z0-9\sÀ-ÿ\-]/g, '')
      .trim()
      .replace(/\s+/g, '')
      .substring(0, 40);
    const pdfFileName = `${numberOnly}-${monthShort}-${cleanCompanyName}.pdf`;
    let pdfBlob: Blob | null = null;

    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

      // === COLORES ===
      const BLUE: [number, number, number] = [30, 64, 175];      // #1e40af
      const BLACK: [number, number, number] = [26, 26, 26];
      const GRAY: [number, number, number] = [107, 114, 128];
      const LIGHT_GRAY: [number, number, number] = [229, 231, 235];
      const BG_BLUE: [number, number, number] = [239, 246, 255]; // #eff6ff

      let y = 20;

      // === HEADER ===
      // Logo/nombre empresa
      doc.setFontSize(20);
      doc.setTextColor(...BLUE);
      doc.setFont('helvetica', 'bold');
      doc.text('Miguel Ángel Ortiz Cruz', 15, y);

      // Factura nº (derecha)
      doc.setFontSize(8);
      doc.setTextColor(...GRAY);
      doc.setFont('helvetica', 'normal');
      doc.text('FACTURA', 195, y - 5, { align: 'right' });
      doc.setFontSize(18);
      doc.setTextColor(...BLACK);
      doc.setFont('helvetica', 'bold');
      doc.text(`Nº ${invoiceFullNumber}`, 195, y + 2, { align: 'right' });
      doc.setFontSize(9);
      doc.setTextColor(...GRAY);
      doc.setFont('helvetica', 'normal');
      const dateFormatted = new Date(today).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
      doc.text(dateFormatted, 195, y + 7, { align: 'right' });

      y += 6;
      doc.setFontSize(8);
      doc.setTextColor(74, 74, 74);
      doc.text('NIF: 49549728T', 15, y);
      y += 4;
      doc.text('Calle Alemania 55', 15, y);
      y += 4;
      doc.text('21110 Aljaraque (Huelva), España', 15, y);
      y += 4;
      doc.text('miguelortizpersonal12@gmail.com', 15, y);

      // Línea separadora
      y += 5;
      doc.setDrawColor(...BLUE);
      doc.setLineWidth(0.7);
      doc.line(15, y, 195, y);

      // === FACTURAR A ===
      y += 10;
      doc.setFontSize(8);
      doc.setTextColor(...BLUE);
      doc.setFont('helvetica', 'bold');
      doc.text('FACTURAR A', 15, y);

      y += 2;
      doc.setDrawColor(...LIGHT_GRAY);
      doc.setLineWidth(0.2);
      doc.line(15, y, 195, y);

      y += 6;
      // Bloque cliente con borde izquierdo azul
      doc.setFillColor(...BLUE);
      doc.rect(15, y - 2, 1.5, 25, 'F');

      doc.setFontSize(12);
      doc.setTextColor(...BLACK);
      doc.setFont('helvetica', 'bold');
      doc.text(clientInfo.name, 20, y + 2);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(74, 74, 74);
      const clientLines = issueData.clientBlock.split('\n').map(l => l.trim()).filter(l => l.length > 0).slice(1);
      let clientY = y + 7;
      for (const line of clientLines) {
        doc.text(line, 20, clientY);
        clientY += 4;
      }
      y = Math.max(y + 25, clientY + 2);

      // === CONCEPTOS ===
      y += 5;
      doc.setFontSize(8);
      doc.setTextColor(...BLUE);
      doc.setFont('helvetica', 'bold');
      doc.text('CONCEPTOS', 15, y);

      y += 4;
      // Tabla de items - cabecera azul
      doc.setFillColor(...BLUE);
      doc.rect(15, y, 180, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('DESCRIPCIÓN', 17, y + 5);
      doc.text('UDS.', 130, y + 5, { align: 'center' });
      doc.text('PRECIO UNIT.', 160, y + 5, { align: 'center' });
      doc.text('TOTAL', 192, y + 5, { align: 'right' });

      // Fila de item
      y += 8;
      doc.setDrawColor(...LIGHT_GRAY);
      doc.setLineWidth(0.2);
      doc.rect(15, y, 180, 10, 'S');
      doc.setTextColor(...BLACK);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      // Descripción puede ser larga - dividir si es necesario
      const conceptLines = doc.splitTextToSize(issueData.concept || 'Servicio', 110);
      doc.text(conceptLines, 17, y + 6);
      doc.text(String(units), 130, y + 6, { align: 'center' });
      doc.text(`${pricePerUnit.toFixed(2).replace('.', ',')} €`, 175, y + 6, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text(`${(units * pricePerUnit).toFixed(2).replace('.', ',')} €`, 192, y + 6, { align: 'right' });

      y += 14;

      // === TOTALES ===
      const totalsX = 115;
      const totalsWidth = 80;

      doc.setFontSize(9);
      doc.setTextColor(...GRAY);
      doc.setFont('helvetica', 'normal');
      doc.text('Base imponible', totalsX + 2, y);
      doc.setTextColor(...BLACK);
      doc.setFont('helvetica', 'bold');
      doc.text(`${subtotal.toFixed(2).replace('.', ',')} €`, totalsX + totalsWidth - 2, y, { align: 'right' });

      y += 5;
      doc.setDrawColor(...LIGHT_GRAY);
      doc.line(totalsX, y - 2, totalsX + totalsWidth, y - 2);

      doc.setFontSize(9);
      doc.setTextColor(...GRAY);
      doc.setFont('helvetica', 'normal');
      doc.text(`IVA (${issueData.hasIVA ? '21' : '0'} %)`, totalsX + 2, y);
      doc.setTextColor(...BLACK);
      doc.setFont('helvetica', 'bold');
      doc.text(`${iva.toFixed(2).replace('.', ',')} €`, totalsX + totalsWidth - 2, y, { align: 'right' });

      y += 6;
      // Total destacado
      doc.setFillColor(...BG_BLUE);
      doc.rect(totalsX, y - 4, totalsWidth, 10, 'F');
      doc.setDrawColor(...BLUE);
      doc.setLineWidth(0.5);
      doc.rect(totalsX, y - 4, totalsWidth, 10, 'S');

      doc.setFontSize(11);
      doc.setTextColor(...BLUE);
      doc.setFont('helvetica', 'bold');
      doc.text('TOTAL A PAGAR', totalsX + 2, y + 2);
      doc.text(`${total.toFixed(2).replace('.', ',')} €`, totalsX + totalsWidth - 2, y + 2, { align: 'right' });

      y += 16;

      // === FORMA DE PAGO ===
      doc.setDrawColor(...BLUE);
      doc.setLineWidth(0.5);
      doc.rect(15, y, 180, 22, 'S');
      doc.setFontSize(8);
      doc.setTextColor(...BLUE);
      doc.setFont('helvetica', 'bold');
      doc.text('FORMA DE PAGO', 17, y + 5);

      doc.setFontSize(9);
      doc.setTextColor(...BLACK);
      doc.setFont('helvetica', 'normal');
      doc.text('Transferencia bancaria al siguiente IBAN:', 17, y + 11);

      doc.setFont('courier', 'bold');
      doc.setTextColor(...BLUE);
      doc.text('ES82 2100 7144 1902 0012 5905', 17, y + 17);

      y += 27;

      // === NOTA LEGAL ===
      doc.setFontSize(8);
      doc.setTextColor(...GRAY);
      doc.setFont('helvetica', 'normal');

      if (issueData.hasIVA) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BLACK);
        doc.text('Forma de pago:', 15, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...GRAY);
        doc.text('Transferencia bancaria al IBAN indicado.', 45, y);
        y += 5;
        doc.text('Factura emitida con IVA 21 % según régimen general de autónomos en España.', 15, y);
      } else {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BLACK);
        doc.text('OPERACIÓN EXTRACOMUNITARIA', 15, y);
        y += 4;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...GRAY);
        const legalLines = doc.splitTextToSize('"NO SUJETA A IVA POR EL ART. 69 y 70 DE LA LEY 37/92 DEL IVA"', 180);
        doc.text(legalLines, 15, y);
        y += 4 * legalLines.length;
      }

      y += 5;
      doc.setDrawColor(...LIGHT_GRAY);
      doc.line(15, y, 195, y);
      y += 4;
      doc.setFontSize(7);
      doc.setTextColor(...GRAY);
      doc.setFont('helvetica', 'italic');
      doc.text('Esta factura ha sido generada electrónicamente · Conserve este documento como justificante', 105, y, { align: 'center' });

      // === GENERAR BLOB DEL PDF ===
      pdfBlob = doc.output('blob');

      // DESCARGAR EL PDF EN EL NAVEGADOR
      const downloadUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = pdfFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (pdfErr) {
      console.error('Error generando PDF:', pdfErr);
      alert('Error al generar el PDF. Revisa la consola.');
      return;
    }

    // 📤 Subir el PDF a Google Drive vía webhook de n8n
    const webhookUrl = process.env.NEXT_PUBLIC_DRIVE_WEBHOOK;
    if (webhookUrl && pdfBlob) {
      try {
        const driveFormData = new FormData();
        driveFormData.append('file', pdfBlob, pdfFileName);
        driveFormData.append('fileName', pdfFileName);
        driveFormData.append('invoiceNumber', invoiceFullNumber);
        driveFormData.append('clientName', clientInfo.name);
        driveFormData.append('total', total.toFixed(2));

        fetch(webhookUrl, {
          method: 'POST',
          body: driveFormData,
        }).then(res => {
          if (res.ok) console.log('✅ Factura PDF subida a Drive');
          else console.error('Drive upload status:', res.status);
        }).catch(err => {
          console.error('Drive upload error:', err);
        });
      } catch (driveErr) {
        console.error('Error preparing Drive upload:', driveErr);
      }
    }

    // Reset form
    setIssueData({
      clientBlock: '',
      concept: '',
      units: '1',
      pricePerUnit: '',
      hasIVA: false,
    });
    setShowIssueDialog(false);
  };

  // Toggle "Pagado" para facturas
  const togglePaid = async (id: string) => {
    const invoice = invoices.find(i => i.id === id);
    if (!invoice) return;
    const updated = { ...invoice, paid: !invoice.paid };
    // Optimistic update
    setInvoices(invoices.map((inv) => inv.id === id ? updated : inv));
    // Persistir en Supabase
    try {
      await fetch('/api/invoices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
    } catch (e) {
      console.error('Error toggling paid:', e);
    }
  };

  const startEditInvoice = (invoice: Invoice) => {
    setEditingId(invoice.id);
    // Calcular el porcentaje IVA actual del invoice
    let ivaPercent = '21';
    if (invoice.vat > 0 && invoice.amountWithoutVAT > 0) {
      ivaPercent = String(Math.round((invoice.vat / invoice.amountWithoutVAT) * 100));
    }
    setFormData({
      number: invoice.number,
      company: invoice.company,
      description: invoice.description || '',
      amount: invoice.amount.toString(),
      amountWithoutVAT: invoice.amountWithoutVAT.toString(),
      category: invoice.category,
      date: invoice.date,
      method: invoice.method || METHODS[0],
      ivaPercent,
    });
    // Pre-cargar el toggle de "Tiene factura"
    setSelectedFile(invoice.hasInvoice ? new File([], 'manual') : null);
    setShowEditDialog(true);
  };

  const saveEditInvoice = async () => {
    if (!editingId || !formData.amount) {
      alert('Por favor introduce el Monto');
      return;
    }
    if (!formData.company && !formData.description) {
      alert('Por favor introduce al menos Empresa o Descripción');
      return;
    }

    const amount = parseFloat(formData.amount);
    const hasInvoice = !!selectedFile;

    // Si tiene factura → calcular IVA basado en el porcentaje
    let amountWithoutVAT = amount;
    let vat = 0;
    if (hasInvoice) {
      const ivaPercent = parseFloat(formData.ivaPercent || '21');
      amountWithoutVAT = amount / (1 + ivaPercent / 100);
      vat = amount - amountWithoutVAT;
    }

    const updatedInvoice = invoices.find(i => i.id === editingId);
    if (!updatedInvoice) return;

    // Si es ingreso → categoría 'work' y método 'Transferencia' fijos
    const isIncomeEdit = updatedInvoice.type === 'income';
    const finalInvoice = {
      ...updatedInvoice,
      number: formData.number,
      // Si solo introdujo Descripción pero no Empresa, usar la Descripción como Empresa
      company: formData.company || formData.description || 'Sin nombre',
      description: formData.description || undefined,
      amount,
      amountWithoutVAT,
      vat,
      date: formData.date,
      category: isIncomeEdit ? 'work' : formData.category,
      method: isIncomeEdit ? 'Transferencia' : formData.method,
      hasInvoice,
    };

    const updated = invoices.map((inv) =>
      inv.id === editingId ? finalInvoice : inv
    );

    setInvoices(updated);
    setShowEditDialog(false);
    setEditingId(null);

    // Persistir en Supabase
    try {
      await fetch('/api/invoices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalInvoice),
      });
    } catch (e) {
      console.error('Error updating invoice:', e);
    }

    alert('✅ Registro guardado en base de datos');
    setFormData({
      number: '',
      company: '',
      amount: '',
      amountWithoutVAT: '',
      description: '',
      category: CATEGORIES[0],
      date: new Date().toISOString().split('T')[0],
      method: METHODS[0],
      ivaPercent: '21',
    });
  };

  const clearFilters = () => {
    const range = getCurrentMonthRange();
    setDateFrom(range.firstDay);
    setDateTo(range.lastDay);
    setFilterType('all');
    setFilterCategory('all');
    setSearchText('');
    setSortBy('date-desc');
  };

  // Cálculos de Contabilidad - Por Trimestre (SOLO transacciones CON FACTURA)
  const accountingData = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const yearInvoices = invoices.filter(inv =>
      new Date(inv.date).getFullYear() === currentYear &&
      inv.hasInvoice === true // SOLO las marcadas con factura
    );

    const calculateQuarter = (q: number) => {
      const startMonth = (q - 1) * 3;
      const endMonth = startMonth + 3;
      const quarterInvoices = yearInvoices.filter(inv => {
        const month = new Date(inv.date).getMonth();
        return month >= startMonth && month < endMonth;
      });

      const incomeInvoices = quarterInvoices.filter(i => i.type === 'income');
      const expenseInvoices = quarterInvoices.filter(i => i.type === 'expense');

      const income = incomeInvoices.reduce((sum, i) => sum + i.amount, 0);
      const expenses = expenseInvoices.reduce((sum, i) => sum + i.amount, 0);
      const benefit = income - expenses;

      // Cálculos fiscales españoles - USA EL IVA REAL DE CADA FACTURA
      // Si la factura tiene vat > 0, usa ese; si no, asume 21% (default)
      const ivaRepercutido = incomeInvoices.reduce((sum, i) =>
        sum + (i.vat > 0 ? i.vat : i.amount - (i.amount / 1.21)), 0);
      const ivaSoportado = expenseInvoices.reduce((sum, i) =>
        sum + (i.vat > 0 ? i.vat : i.amount - (i.amount / 1.21)), 0);

      const ivaAPagar = Math.max(0, ivaRepercutido - ivaSoportado); // Modelo 303

      // IRPF se calcula sobre la base imponible (sin IVA)
      const baseIngresos = incomeInvoices.reduce((sum, i) =>
        sum + (i.amountWithoutVAT > 0 ? i.amountWithoutVAT : i.amount / 1.21), 0);
      const baseGastos = expenseInvoices.reduce((sum, i) =>
        sum + (i.amountWithoutVAT > 0 ? i.amountWithoutVAT : i.amount / 1.21), 0);
      const baseBeneficio = baseIngresos - baseGastos;

      const irpfRetencion = Math.max(0, baseBeneficio * 0.20); // Modelo 130 (20%)
      const totalImpuestos = ivaAPagar + irpfRetencion;
      const beneficioNeto = benefit - totalImpuestos;

      return {
        quarter: q,
        income,
        expenses,
        benefit,
        ivaRepercutido,
        ivaSoportado,
        ivaAPagar,
        irpfRetencion,
        totalImpuestos,
        beneficioNeto,
        count: quarterInvoices.length,
      };
    };

    const quarters = [1, 2, 3, 4].map(q => calculateQuarter(q));

    // Cálculo anual
    const yearIncome = yearInvoices.filter(i => i.type === 'income').reduce((sum, i) => sum + i.amount, 0);
    const yearExpenses = yearInvoices.filter(i => i.type === 'expense').reduce((sum, i) => sum + i.amount, 0);
    const yearBenefit = yearIncome - yearExpenses;
    const yearIVAPagar = quarters.reduce((sum, q) => sum + q.ivaAPagar, 0);
    const yearIRPF = quarters.reduce((sum, q) => sum + q.irpfRetencion, 0);
    const yearTotalImpuestos = yearIVAPagar + yearIRPF;
    const yearBeneficioNeto = yearBenefit - yearTotalImpuestos;

    // Trimestre actual
    const currentMonth = new Date().getMonth();
    const currentQuarter = Math.floor(currentMonth / 3) + 1;

    return {
      quarters,
      year: {
        income: yearIncome,
        expenses: yearExpenses,
        benefit: yearBenefit,
        ivaAPagar: yearIVAPagar,
        irpf: yearIRPF,
        totalImpuestos: yearTotalImpuestos,
        beneficioNeto: yearBeneficioNeto,
      },
      currentQuarter,
    };
  }, [invoices]);

  // Sidebar Component - Profesional Dark Mode
  const Sidebar = () => {
    const invoicesIncomeCount = invoices.filter(i => i.type === 'income' && i.hasInvoice).length;
    const invoicesExpenseCount = invoices.filter(i => i.type === 'expense' && i.hasInvoice).length;

    const navItems = [
      { id: 'dashboard' as ViewType, label: 'Dashboard', icon: LayoutDashboard, badge: null },
      { id: 'transactions' as ViewType, label: 'Transacciones', icon: Receipt, badge: invoices.length },
      { id: 'accounting' as ViewType, label: 'Contabilidad', icon: Calculator, badge: 'Q' + accountingData.currentQuarter },
      { id: 'invoices-income' as ViewType, label: 'Fact. Ingresos', icon: TrendingUp, badge: invoicesIncomeCount },
      { id: 'invoices-expense' as ViewType, label: 'Fact. Gastos', icon: TrendingDown, badge: invoicesExpenseCount },
      { id: 'subscriptions' as ViewType, label: 'Suscripciones', icon: RefreshCw, badge: null },
      { id: 'categories' as ViewType, label: 'Categorías', icon: Tag, badge: null },
      { id: 'settings' as ViewType, label: 'Configuración', icon: Settings, badge: null },
    ];

    return (
      <>
        {/* Overlay para cerrar el sidebar móvil */}
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/60 z-40 md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}
      <aside className={`bg-zinc-950 text-white w-64 min-h-screen flex flex-col fixed left-0 top-0 z-50 border-r border-zinc-800/50 transition-transform duration-300 ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        {/* Logo */}
        <div className="p-6 border-b border-zinc-800/50">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-2.5 rounded-xl shadow-lg shadow-emerald-500/20">
              <DollarSign size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">FinanzApp</h1>
              <p className="text-[10px] text-emerald-400 font-semibold tracking-widest uppercase">Pro</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          <p className="text-[10px] text-zinc-600 font-bold tracking-widest uppercase px-3 mb-2 mt-2">Navegación</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveView(item.id);
                  setMobileSidebarOpen(false); // Cerrar sidebar móvil al navegar
                  // Al entrar a Fact. Ingresos/Gastos, resetear orden a "Nº Desc"
                  if (item.id === 'invoices-income' || item.id === 'invoices-expense') {
                    setInvoiceSortBy('number-desc');
                  }
                }}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg transition-all group ${
                  isActive
                    ? 'bg-gradient-to-r from-emerald-500/20 to-emerald-500/5 text-white border border-emerald-500/30'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-white border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon size={18} className={isActive ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-300'} />
                  <span className="font-medium text-sm">{item.label}</span>
                </div>
                {item.badge && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    isActive
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-zinc-800 text-zinc-500 group-hover:bg-zinc-700'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Acciones rápidas */}
        <div className="p-3 border-t border-zinc-800/50 space-y-2">
          <p className="text-[10px] text-zinc-600 font-bold tracking-widest uppercase px-3 mb-2">Acciones</p>

          {/* Refresh */}
          <button
            onClick={loadInvoices}
            disabled={refreshing}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-white transition-all group"
          >
            <RefreshCw size={18} className={`text-zinc-500 group-hover:text-emerald-400 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span className="font-medium text-sm">{refreshing ? 'Actualizando...' : 'Actualizar Datos'}</span>
          </button>

          {/* Theme Toggle */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-white transition-all group"
          >
            <div className="flex items-center gap-3">
              {theme === 'dark' ? (
                <Moon size={18} className="text-zinc-500 group-hover:text-amber-400" />
              ) : (
                <Sun size={18} className="text-amber-400" />
              )}
              <span className="font-medium text-sm">Modo {theme === 'dark' ? 'Oscuro' : 'Claro'}</span>
            </div>
            <div className={`w-9 h-5 rounded-full relative transition-all ${theme === 'dark' ? 'bg-zinc-700' : 'bg-amber-500'}`}>
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all ${theme === 'light' ? 'translate-x-4' : ''}`}></div>
            </div>
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-400 hover:bg-rose-500/10 hover:text-rose-400 transition-all group border border-transparent hover:border-rose-500/20 mt-2"
          >
            <X size={18} className="text-zinc-500 group-hover:text-rose-400" />
            <span className="font-medium text-sm">Cerrar Sesión</span>
          </button>
        </div>
      </aside>
      </>
    );
  };

  // Vista de Contabilidad
  const AccountingView = () => (
    <div className="space-y-8">
      {/* Header de Contabilidad */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-xl p-8 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="bg-white/20 p-3 rounded-lg">
            <Calculator size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Contabilidad</h1>
            <p className="text-blue-100">Resumen fiscal y trimestral - Año {new Date().getFullYear()}</p>
          </div>
        </div>
      </div>

      {/* Resumen Trimestre Actual */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">📊 Resumen Trimestre Actual (Q{accountingData.currentQuarter})</h2>
          <span className="text-xs text-zinc-500">{['Ene · Feb · Mar', 'Abr · May · Jun', 'Jul · Ago · Sep', 'Oct · Nov · Dic'][accountingData.currentQuarter - 1]}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 border-l-4 border-green-500 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-zinc-400 font-semibold">INGRESOS</p>
              <TrendingUp className="text-green-500" size={20} />
            </div>
            <p className="text-3xl font-bold text-emerald-400">{accountingData.quarters[accountingData.currentQuarter - 1].income.toFixed(2)}€</p>
          </div>

          <div className="bg-zinc-900 rounded-xl border border-zinc-800 border-l-4 border-red-500 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-zinc-400 font-semibold">GASTOS</p>
              <TrendingDown className="text-red-500" size={20} />
            </div>
            <p className="text-3xl font-bold text-rose-400">{accountingData.quarters[accountingData.currentQuarter - 1].expenses.toFixed(2)}€</p>
          </div>

          <div className={`bg-zinc-900 rounded-xl border border-zinc-800 border-l-4 ${accountingData.quarters[accountingData.currentQuarter - 1].benefit >= 0 ? 'border-blue-500' : 'border-orange-500'} p-6 shadow-sm`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-zinc-400 font-semibold">BENEFICIO BRUTO</p>
              <PiggyBank className={accountingData.quarters[accountingData.currentQuarter - 1].benefit >= 0 ? 'text-blue-500' : 'text-orange-500'} size={20} />
            </div>
            <p className={`text-3xl font-bold ${accountingData.quarters[accountingData.currentQuarter - 1].benefit >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>
              {accountingData.quarters[accountingData.currentQuarter - 1].benefit.toFixed(2)}€
            </p>
          </div>

          <div className="bg-zinc-900 rounded-xl border border-zinc-800 border-l-4 border-purple-500 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-zinc-400 font-semibold">BENEFICIO NETO</p>
              <Wallet className="text-purple-500" size={20} />
            </div>
            <p className="text-3xl font-bold text-violet-400">{accountingData.quarters[accountingData.currentQuarter - 1].beneficioNeto.toFixed(2)}€</p>
            <p className="text-xs text-zinc-500 mt-1">Tras impuestos</p>
          </div>
        </div>
      </div>

      {/* Impuestos Trimestre */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">💰 Impuestos Estimados (Trimestre Q{accountingData.currentQuarter})</h2>
          <span className="text-xs text-zinc-500">A pagar al finalizar el trimestre</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-zinc-900 border border-orange-500/20 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-orange-500 text-white p-2 rounded-lg">
                <Percent size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-300">IVA A PAGAR</p>
                <p className="text-xs text-zinc-500">Modelo 303 (21%)</p>
              </div>
            </div>
            <p className="text-2xl font-bold text-orange-400">{accountingData.quarters[accountingData.currentQuarter - 1].ivaAPagar.toFixed(2)}€</p>
          </div>

          <div className="bg-zinc-900 border border-rose-500/20 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-red-500 text-white p-2 rounded-lg">
                <FileText size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-300">IRPF (Pagos a Cuenta)</p>
                <p className="text-xs text-zinc-500">Modelo 130 (20%)</p>
              </div>
            </div>
            <p className="text-2xl font-bold text-rose-400">{accountingData.quarters[accountingData.currentQuarter - 1].irpfRetencion.toFixed(2)}€</p>
          </div>

          <div className="bg-gradient-to-br from-amber-500/10 to-zinc-900 border border-amber-500/30 rounded-xl p-6 hover:border-amber-500/50 transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-gradient-to-br from-amber-500 to-yellow-600 text-white p-2.5 rounded-xl shadow-lg shadow-amber-500/20">
                <AlertCircle size={18} />
              </div>
              <div>
                <p className="text-xs font-bold text-white tracking-wide">TOTAL IMPUESTOS</p>
                <p className="text-[10px] text-zinc-500 tracking-wider uppercase">IVA + IRPF</p>
              </div>
            </div>
            <p className="text-3xl font-bold text-amber-400">{accountingData.quarters[accountingData.currentQuarter - 1].totalImpuestos.toFixed(2)}€</p>
          </div>
        </div>
      </div>

      {/* Cálculos por Trimestre */}
      <div>
        <h2 className="text-xl font-bold text-white mb-4">📅 Desglose por Trimestres</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {accountingData.quarters.map((q) => {
            const isCurrentQuarter = q.quarter === accountingData.currentQuarter;
            const quarterLabel = ['Q1 (Ene-Mar)', 'Q2 (Abr-Jun)', 'Q3 (Jul-Sep)', 'Q4 (Oct-Dic)'][q.quarter - 1];

            return (
              <div
                key={q.quarter}
                className={`bg-zinc-900 rounded-xl border-2 p-5 shadow-sm ${
                  isCurrentQuarter ? 'border-blue-500 ring-2 ring-blue-100' : 'border-zinc-800'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-white">{quarterLabel}</h3>
                  {isCurrentQuarter && (
                    <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full font-semibold">
                      ACTUAL
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                    <span className="text-xs text-zinc-400">Ingresos</span>
                    <span className="text-sm font-bold text-emerald-400">+{q.income.toFixed(2)}€</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                    <span className="text-xs text-zinc-400">Gastos</span>
                    <span className="text-sm font-bold text-rose-400">-{q.expenses.toFixed(2)}€</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                    <span className="text-xs text-zinc-400 font-semibold">Beneficio</span>
                    <span className={`text-sm font-bold ${q.benefit >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>
                      {q.benefit.toFixed(2)}€
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                    <span className="text-xs text-zinc-400">IVA (303)</span>
                    <span className="text-sm font-bold text-orange-400">{q.ivaAPagar.toFixed(2)}€</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                    <span className="text-xs text-zinc-400">IRPF (130)</span>
                    <span className="text-sm font-bold text-rose-400">{q.irpfRetencion.toFixed(2)}€</span>
                  </div>
                  <div className="bg-zinc-950 -mx-5 -mb-5 px-5 py-3 mt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-zinc-300">A PAGAR</span>
                      <span className="text-base font-bold text-slate-900">{q.totalImpuestos.toFixed(2)}€</span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">{q.count} transacciones</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Calendario Fiscal */}
      <div className="bg-zinc-900 border border-blue-500/20 rounded-lg p-6">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Calendar className="text-blue-400" size={24} />
          📌 Calendario Fiscal Trimestral
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-400 font-semibold mb-1">Q1 - Plazo</p>
            <p className="text-sm font-bold text-white">1 - 20 Abril</p>
            <p className="text-xs text-zinc-500 mt-1">Modelos 303 + 130</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-400 font-semibold mb-1">Q2 - Plazo</p>
            <p className="text-sm font-bold text-white">1 - 20 Julio</p>
            <p className="text-xs text-zinc-500 mt-1">Modelos 303 + 130</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-400 font-semibold mb-1">Q3 - Plazo</p>
            <p className="text-sm font-bold text-white">1 - 20 Octubre</p>
            <p className="text-xs text-zinc-500 mt-1">Modelos 303 + 130</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-400 font-semibold mb-1">Q4 - Plazo</p>
            <p className="text-sm font-bold text-white">1 - 30 Enero</p>
            <p className="text-xs text-zinc-500 mt-1">Modelos 303 + 130</p>
          </div>
        </div>
      </div>
    </div>
  );

  // Pantalla de carga mientras verifica la sesión
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-white text-sm">Cargando...</div>
      </div>
    );
  }

  // Pantalla de Login si NO autenticado
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden">
        {/* Background effects */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full -mr-48 -mt-48 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full -ml-48 -mb-48 blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-violet-500/5 rounded-full blur-3xl"></div>

        <div className="relative w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl shadow-lg shadow-emerald-500/30 mb-4">
              <DollarSign size={32} className="text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">FinanzApp</h1>
            <p className="text-xs text-emerald-400 font-semibold tracking-widest uppercase mt-1">Pro · Acceso Restringido</p>
          </div>

          {/* Form */}
          <form
            onSubmit={handleLogin}
            className="bg-gradient-to-br from-zinc-900 to-zinc-900/50 border border-zinc-800 rounded-2xl p-8 shadow-2xl shadow-emerald-500/5 backdrop-blur-xl"
          >
            <h2 className="text-lg font-bold text-white mb-1">Iniciar Sesión</h2>
            <p className="text-xs text-zinc-500 mb-6">Introduce tus credenciales para acceder</p>

            {/* Email */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-zinc-400 mb-2 tracking-wider uppercase">Email</label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="tu@email.com"
                autoComplete="username"
                className="w-full px-4 py-3 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white bg-zinc-950 placeholder:text-zinc-600 text-sm"
                required
              />
            </div>

            {/* Password */}
            <div className="mb-5">
              <label className="block text-xs font-bold text-zinc-400 mb-2 tracking-wider uppercase">Contraseña</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••"
                autoComplete="current-password"
                className="w-full px-4 py-3 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white bg-zinc-950 placeholder:text-zinc-600 text-sm"
                required
              />
            </div>

            {/* Error message */}
            {loginError && (
              <div className="mb-4 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
                <p className="text-xs text-rose-400 font-semibold flex items-center gap-2">
                  <AlertCircle size={14} />
                  {loginError}
                </p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold py-3 px-4 rounded-lg transition-all shadow-lg shadow-emerald-500/30 hover:scale-[1.02]"
            >
              ✨ Acceder al Panel
            </button>

            {/* Footer */}
            <p className="text-[10px] text-zinc-600 text-center mt-6 leading-relaxed">
              Tu sesión se mantendrá activa en este navegador.<br />
              Para mayor seguridad, cierra sesión al terminar.
            </p>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors ${theme === 'dark' ? 'bg-zinc-950' : 'bg-zinc-100'}`} data-theme={theme}>
      <Sidebar />

      {/* Header móvil con botón hamburguesa - SOLO se muestra en móvil */}
      <div className="md:hidden sticky top-0 z-30 bg-zinc-950/95 backdrop-blur-xl border-b border-zinc-800 flex items-center justify-between px-4 py-3">
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="text-white p-2 rounded-lg hover:bg-zinc-800 transition-colors"
          aria-label="Abrir menú"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
            <DollarSign size={18} className="text-white" />
          </div>
          <span className="text-white font-bold">FinanzApp</span>
        </div>
        <div className="w-10" /> {/* Spacer para centrar el logo */}
      </div>

      <div className="md:ml-64">
        {/* Header Premium */}
        {activeView === 'dashboard' && (
        <div className="bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/50 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 md:py-5">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard</h1>
                <p className="text-sm text-zinc-500 mt-0.5">Vista general · {invoices.length} registros activos</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowImportDialog(true)}
                  className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 font-medium py-2 px-4 rounded-lg flex items-center gap-2 transition-all text-sm"
                >
                  <FileUp size={16} />
                  Importar CSV
                </button>
                <button
                  onClick={() => openIncomeDialog()}
                  className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-medium py-2 px-4 rounded-lg flex items-center gap-2 transition-all text-sm shadow-lg shadow-emerald-500/20"
                >
                  <TrendingUp size={16} />
                  Ingreso
                </button>
                <button
                  onClick={() => openExpenseDialog()}
                  className="bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-medium py-2 px-4 rounded-lg flex items-center gap-2 transition-all text-sm shadow-lg shadow-rose-500/20"
                >
                  <TrendingDown size={16} />
                  Gasto
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-8">
        {loading && (
          <div className="bg-zinc-900 border border-blue-500/20 rounded-lg p-4 mb-8 text-center">
            <p className="text-blue-400 font-semibold">⏳ Cargando tus datos...</p>
          </div>
        )}

        {/* CONTENIDO PRINCIPAL */}
        {activeView === 'accounting' && <AccountingView />}

        {/* VISTA DE FACT. INGRESOS / FACT. GASTOS */}
        {(activeView === 'invoices-income' || activeView === 'invoices-expense') && (() => {
          const isIncome = activeView === 'invoices-income';
          const invoiceType = isIncome ? 'income' : 'expense';
          const colorClass = isIncome ? 'emerald' : 'rose';
          const Icon = isIncome ? TrendingUp : TrendingDown;

          // Solo facturas (hasInvoice === true) del tipo correspondiente Y a partir de Abril del año actual
          const minDate = `${new Date().getFullYear()}-04-01`;
          const invoicesList = invoices
            .filter(i =>
              i.type === invoiceType &&
              i.hasInvoice === true &&
              i.date >= minDate
            )
            .sort((a, b) => {
              switch (invoiceSortBy) {
                case 'number-asc': {
                  // Para gastos: ordena por mes + número usando la FECHA (más robusto)
                  if (!isIncome) {
                    const monthA = parseInt(a.date.slice(5, 7)); // Mes de la fecha
                    const monthB = parseInt(b.date.slice(5, 7));
                    const numA = parseInt(a.number) || 0;
                    const numB = parseInt(b.number) || 0;

                    // Primero por mes, luego por número (ambos ascendentes)
                    if (monthA !== monthB) return monthA - monthB;
                    return numA - numB;
                  }

                  // Para ingresos: ordena por número simple
                  const numA = parseInt(a.number) || 0;
                  const numB = parseInt(b.number) || 0;
                  return numA - numB;
                }
                case 'number-desc': {
                  // Para gastos: ordena por mes (DESC) + número (DESC) usando la FECHA
                  if (!isIncome) {
                    const monthA = parseInt(a.date.slice(5, 7)); // Mes de la fecha
                    const monthB = parseInt(b.date.slice(5, 7));
                    const numA = parseInt(a.number) || 0;
                    const numB = parseInt(b.number) || 0;

                    // Primero por mes DESC, luego por número DESC (últimas primero)
                    if (monthA !== monthB) return monthB - monthA;
                    return numB - numA;
                  }

                  // Para ingresos: ordena por número simple
                  const numA = parseInt(a.number) || 0;
                  const numB = parseInt(b.number) || 0;
                  return numB - numA;
                }
                case 'date-asc':
                  return new Date(a.date).getTime() - new Date(b.date).getTime();
                case 'date-desc':
                  return new Date(b.date).getTime() - new Date(a.date).getTime();
                default:
                  return 0;
              }
            });

          // Función para abrir el modal con "Tiene factura" pre-activado
          // Desde "Fact. Ingresos" / "Fact. Gastos" → siempre con factura (hasInvoice=true)
          const openInvoiceDialog = () => {
            if (isIncome) {
              openIncomeDialog(true);
            } else {
              openExpenseDialog(true);
            }
          };

          const total = invoicesList.reduce((sum, i) => sum + i.amount, 0);
          const ivaTotal = total * 0.21;

          // Calcular pagado vs pendiente
          const paidInvoices = invoicesList.filter(i => i.paid);
          const pendingInvoices = invoicesList.filter(i => !i.paid);
          const paidAmount = paidInvoices.reduce((sum, i) => sum + i.amount, 0);
          const pendingAmount = pendingInvoices.reduce((sum, i) => sum + i.amount, 0);

          // Agrupar por trimestre
          const quarters = [1, 2, 3, 4].map(q => {
            const qInvoices = invoicesList.filter(inv => {
              const month = new Date(inv.date).getMonth();
              return month >= (q - 1) * 3 && month < q * 3 &&
                     new Date(inv.date).getFullYear() === new Date().getFullYear();
            });
            return {
              quarter: q,
              count: qInvoices.length,
              total: qInvoices.reduce((s, i) => s + i.amount, 0),
            };
          });

          return (
            <div className="space-y-6">
              {/* Hero Header */}
              <div className={`relative bg-gradient-to-br from-zinc-900 via-zinc-900 to-${colorClass}-950/30 rounded-2xl p-8 border border-zinc-800 overflow-hidden`}>
                <div className={`absolute top-0 right-0 w-96 h-96 bg-${colorClass}-500/5 rounded-full -mr-48 -mt-48 blur-3xl`}></div>
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-5">
                    <div className={`bg-gradient-to-br from-${colorClass}-500 to-${colorClass}-600 p-4 rounded-2xl shadow-lg shadow-${colorClass}-500/20`}>
                      <Icon size={32} className="text-white" />
                    </div>
                    <div>
                      <h1 className="text-3xl font-bold text-white tracking-tight">
                        {isIncome ? 'Facturas de Ingresos' : 'Facturas de Gastos'}
                      </h1>
                      <p className="text-zinc-400 text-sm mt-1">
                        Desde Abril {new Date().getFullYear()} · <span className={`text-${colorClass}-400 font-semibold`}>{invoicesList.length} facturas</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {isIncome && (
                      <button
                        onClick={async () => {
                          // Recargar facturas desde Supabase para asegurar número correcto
                          await loadInvoices();
                          setShowIssueDialog(true);
                        }}
                        className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:scale-105 text-white font-semibold py-3 px-5 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-blue-500/30"
                      >
                        <FileText size={18} />
                        <span>Emitir Factura</span>
                      </button>
                    )}
                    <button
                      onClick={openInvoiceDialog}
                      className={`bg-gradient-to-r from-${colorClass}-500 to-${colorClass}-600 hover:scale-105 text-white font-semibold py-3 px-5 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-${colorClass}-500/30`}
                    >
                      <Plus size={18} />
                      <span>{isIncome ? 'Añadir Recibida' : 'Añadir Factura'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={`bg-gradient-to-br from-${colorClass}-500/10 to-zinc-900 rounded-xl border border-${colorClass}-500/20 p-6`}>
                  <p className={`text-xs font-bold text-${colorClass}-400 tracking-widest uppercase mb-2`}>Total Facturado</p>
                  <p className="text-3xl font-bold text-white">{total.toFixed(2)}€</p>
                  <p className="text-xs text-zinc-500 mt-1">{invoicesList.length} facturas</p>
                </div>
                <div className="bg-gradient-to-br from-amber-500/10 to-zinc-900 rounded-xl border border-amber-500/20 p-6">
                  <p className="text-xs font-bold text-amber-400 tracking-widest uppercase mb-2">IVA {isIncome ? 'Repercutido' : 'Soportado'} (21%)</p>
                  <p className="text-3xl font-bold text-amber-400">{ivaTotal.toFixed(2)}€</p>
                  <p className="text-xs text-zinc-500 mt-1">{isIncome ? 'Que has cobrado' : 'Que puedes deducir'}</p>
                </div>
                <div className="bg-gradient-to-br from-blue-500/10 to-zinc-900 rounded-xl border border-blue-500/20 p-6">
                  <p className="text-xs font-bold text-blue-400 tracking-widest uppercase mb-2">Base Imponible</p>
                  <p className="text-3xl font-bold text-white">{(total - ivaTotal).toFixed(2)}€</p>
                  <p className="text-xs text-zinc-500 mt-1">Sin IVA</p>
                </div>
              </div>

              {/* Estado de Pagos - SOLO en Fact. Ingresos */}
              {isIncome && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gradient-to-br from-emerald-500/10 to-zinc-900 rounded-xl border border-emerald-500/20 p-5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-emerald-400 tracking-widest uppercase">✓ Cobradas</p>
                      <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-1 rounded">{paidInvoices.length}</span>
                    </div>
                    <p className="text-2xl font-bold text-emerald-400">{paidAmount.toFixed(2)}€</p>
                    <p className="text-xs text-zinc-500 mt-1">Dinero cobrado</p>
                  </div>
                  <div className="bg-gradient-to-br from-amber-500/10 to-zinc-900 rounded-xl border border-amber-500/20 p-5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-amber-400 tracking-widest uppercase">⏳ Pendientes</p>
                      <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold px-2 py-1 rounded">{pendingInvoices.length}</span>
                    </div>
                    <p className="text-2xl font-bold text-amber-400">{pendingAmount.toFixed(2)}€</p>
                    <p className="text-xs text-zinc-500 mt-1">Por cobrar</p>
                  </div>
                </div>
              )}

              {/* Desglose por Trimestre */}
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight mb-4">Desglose por Trimestre {new Date().getFullYear()}</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {quarters.map((q) => (
                    <div key={q.quarter} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                      <p className="text-xs font-bold text-zinc-400 tracking-widest uppercase">Q{q.quarter}</p>
                      <p className={`text-2xl font-bold text-${colorClass}-400 mt-2`}>{q.total.toFixed(2)}€</p>
                      <p className="text-xs text-zinc-500 mt-1">{q.count} facturas</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Lista de Facturas */}
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <h2 className="text-lg font-bold text-white">Lista de Facturas</h2>
                    <span className="text-xs text-zinc-500">{invoicesList.length} registros</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Ordenar:</span>
                    <div className="flex gap-1 bg-zinc-800 p-1 rounded-lg">
                      <button
                        onClick={() => setInvoiceSortBy('number-asc')}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                          invoiceSortBy === 'number-asc'
                            ? `bg-gradient-to-r from-${colorClass}-500 to-${isIncome ? 'teal' : 'pink'}-600 text-white shadow-md`
                            : 'text-zinc-400 hover:text-white'
                        }`}
                        title={isIncome ? "Número ascendente (1, 2, 3...)" : "Por mes antiguo primero"}
                      >
                        {isIncome ? 'Nº Asc' : 'Mes Asc'}
                      </button>
                      <button
                        onClick={() => setInvoiceSortBy('number-desc')}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                          invoiceSortBy === 'number-desc'
                            ? `bg-gradient-to-r from-${colorClass}-500 to-${isIncome ? 'teal' : 'pink'}-600 text-white shadow-md`
                            : 'text-zinc-400 hover:text-white'
                        }`}
                        title={isIncome ? "Número descendente (24, 23, 22...)" : "Por mes reciente primero"}
                      >
                        {isIncome ? 'Nº Desc' : 'Mes Desc'}
                      </button>
                      <button
                        onClick={() => setInvoiceSortBy('date-asc')}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                          invoiceSortBy === 'date-asc'
                            ? `bg-gradient-to-r from-${colorClass}-500 to-${isIncome ? 'teal' : 'pink'}-600 text-white shadow-md`
                            : 'text-zinc-400 hover:text-white'
                        }`}
                        title="Fecha ascendente (más antigua primero)"
                      >
                        Fecha ↑
                      </button>
                      <button
                        onClick={() => setInvoiceSortBy('date-desc')}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                          invoiceSortBy === 'date-desc'
                            ? `bg-gradient-to-r from-${colorClass}-500 to-${isIncome ? 'teal' : 'pink'}-600 text-white shadow-md`
                            : 'text-zinc-400 hover:text-white'
                        }`}
                        title="Fecha descendente (más reciente primero)"
                      >
                        Fecha ↓
                      </button>
                    </div>
                  </div>
                </div>
                {invoicesList.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-zinc-950 border-b border-zinc-800">
                        <tr>
                          <th className="text-center py-3 px-3 text-xs font-bold text-zinc-400 tracking-wider uppercase">Nº</th>
                          <th className="text-left py-3 px-4 text-xs font-bold text-zinc-400 tracking-wider uppercase">Empresa</th>
                          <th className="text-left py-3 px-4 text-xs font-bold text-zinc-400 tracking-wider uppercase">Descripción</th>
                          <th className="text-right py-3 px-3 text-xs font-bold text-zinc-400 tracking-wider uppercase">Base</th>
                          <th className="text-right py-3 px-3 text-xs font-bold text-zinc-400 tracking-wider uppercase">IVA</th>
                          <th className="text-right py-3 px-3 text-xs font-bold text-zinc-400 tracking-wider uppercase">Total</th>
                          <th className="text-left py-3 px-3 text-xs font-bold text-zinc-400 tracking-wider uppercase">Fecha</th>
                          {isIncome && <th className="text-center py-3 px-3 text-xs font-bold text-zinc-400 tracking-wider uppercase">Cobrada</th>}
                          <th className="text-center py-3 px-3 text-xs font-bold text-zinc-400 tracking-wider uppercase">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoicesList.map((inv, idx) => {
                          const base = inv.amountWithoutVAT > 0 ? inv.amountWithoutVAT : inv.amount / 1.21;
                          const iva = inv.vat > 0 ? inv.vat : inv.amount - base;
                          const isPendingIncome = isIncome && !inv.paid;
                          return (
                            <tr key={inv.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${isPendingIncome ? 'bg-amber-500/20' : (idx % 2 === 0 ? 'bg-zinc-900/50' : 'bg-zinc-900/20')}`}>
                              <td className="py-3 px-3 text-center">
                                <span className="inline-flex items-center justify-center min-w-[2.5rem] h-7 px-2 bg-zinc-800 border border-zinc-700 rounded text-xs font-bold text-white">
                                  {inv.number || '-'}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-semibold text-white text-sm">{inv.company || '-'}</div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="text-sm text-zinc-300">{inv.description || <span className="text-zinc-600 italic">Sin descripción</span>}</div>
                              </td>
                              <td className="py-3 px-3 text-right text-zinc-300 text-sm whitespace-nowrap">{base.toFixed(2)}€</td>
                              <td className="py-3 px-3 text-right text-amber-400 text-sm whitespace-nowrap">{iva.toFixed(2)}€</td>
                              <td className={`py-3 px-3 text-right font-bold text-${colorClass}-400 whitespace-nowrap`}>{inv.amount.toFixed(2)}€</td>
                              <td className="py-3 px-3 text-zinc-400 text-sm whitespace-nowrap">{inv.date}</td>
                              {isIncome && (
                                <td className="py-3 px-3 text-center">
                                  <label className="inline-flex items-center cursor-pointer" title={inv.paid ? 'Cobrada' : 'Pendiente de cobro'}>
                                    <input
                                      type="checkbox"
                                      checked={inv.paid || false}
                                      onChange={() => togglePaid(inv.id)}
                                      className="sr-only peer"
                                    />
                                    <div className={`w-10 h-5 rounded-full transition-all relative ${inv.paid ? 'bg-emerald-500' : 'bg-zinc-700'}`}>
                                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all ${inv.paid ? 'translate-x-5' : ''}`}></div>
                                    </div>
                                  </label>
                                  <div className={`text-[10px] mt-1 font-semibold ${inv.paid ? 'text-emerald-400' : 'text-amber-400'}`}>
                                    {inv.paid ? '✓ Cobrada' : 'Pendiente'}
                                  </div>
                                </td>
                              )}
                              <td className="py-3 px-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  {inv.pdfUrl && (
                                    <a
                                      href={inv.pdfUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 p-2 rounded-lg transition-all"
                                      title="Ver PDF"
                                    >
                                      📎
                                    </a>
                                  )}
                                  <button
                                    onClick={() => startEditInvoice(inv)}
                                    className="text-blue-500 hover:text-blue-400 hover:bg-blue-500/10 p-2 rounded-lg transition-all"
                                    title="Editar"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    onClick={() => deleteInvoice(inv.id)}
                                    className="text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 p-2 rounded-lg transition-all"
                                    title="Eliminar"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 px-6">
                    <FileText size={48} className="text-zinc-700 mb-4" />
                    <p className="text-zinc-400 text-lg font-semibold mb-2">No hay facturas todavía</p>
                    <p className="text-zinc-500 text-sm mb-6">Crea tu primera factura {isIncome ? 'de ingreso' : 'de gasto'} desde abril {new Date().getFullYear()}</p>
                    <button
                      onClick={openInvoiceDialog}
                      className={`bg-gradient-to-r from-${colorClass}-500 to-${colorClass}-600 hover:scale-105 text-white font-semibold py-2.5 px-5 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-${colorClass}-500/30`}
                    >
                      <Plus size={18} />
                      <span>Añadir Primera Factura</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* VISTA DE SUSCRIPCIONES MENSUALES */}
        {activeView === 'subscriptions' && (() => {
          const {
            expenseInvoices,
            months,
            monthNames,
            grouped,
            companies,
            recurrent,
            monthTotals,
            currentMonth,
          } = subscriptionData;

          return (
            <div className="space-y-6">
              {/* Hero Header */}
              <div className="relative bg-gradient-to-br from-zinc-900 via-zinc-900 to-cyan-950/30 rounded-2xl p-8 border border-zinc-800 overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full -mr-48 -mt-48 blur-3xl"></div>
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-5">
                    <div className="bg-gradient-to-br from-cyan-500 to-blue-600 p-4 rounded-2xl shadow-lg shadow-cyan-500/20">
                      <RefreshCw size={32} className="text-white" />
                    </div>
                    <div>
                      <h1 className="text-3xl font-bold text-white tracking-tight">Suscripciones Mensuales</h1>
                      <p className="text-zinc-400 text-sm mt-1">
                        Control de gastos recurrentes · <span className="text-cyan-400 font-semibold">{companies.length} proveedores</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Resumen por mes */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {months.map(m => {
                  const isCurrentMonth = m === currentMonth;
                  return (
                    <div
                      key={m}
                      className={`rounded-xl border p-5 ${
                        isCurrentMonth
                          ? 'bg-gradient-to-br from-cyan-500/10 to-zinc-900 border-cyan-500/30 ring-1 ring-cyan-500/20'
                          : 'bg-zinc-900 border-zinc-800'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className={`text-xs font-bold tracking-widest uppercase ${isCurrentMonth ? 'text-cyan-400' : 'text-zinc-400'}`}>{monthNames[m as keyof typeof monthNames]}</p>
                        {isCurrentMonth && (
                          <span className="bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-[10px] font-bold px-2 py-0.5 rounded">ACTUAL</span>
                        )}
                      </div>
                      <p className="text-2xl font-bold text-white">{monthTotals[m].toFixed(2)}€</p>
                      <p className="text-xs text-zinc-500 mt-1">{expenseInvoices.filter(i => i.date.slice(5, 7) === m).length} facturas</p>
                    </div>
                  );
                })}
              </div>

              {/* Tabla comparativa */}
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-white">Comparativa por Proveedor</h2>
                  <span className="text-xs text-zinc-500">{recurrent.length} suscripciones recurrentes</span>
                </div>
                {companies.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-zinc-950 border-b border-zinc-800">
                        <tr>
                          <th className="text-left py-3 px-4 text-xs font-bold text-zinc-400 tracking-wider uppercase">Proveedor</th>
                          {months.map(m => (
                            <th key={m} className={`text-right py-3 px-4 text-xs font-bold tracking-wider uppercase ${m === currentMonth ? 'text-cyan-400 bg-cyan-500/5' : 'text-zinc-400'}`}>
                              {monthNames[m as keyof typeof monthNames]}
                            </th>
                          ))}
                          <th className="text-right py-3 px-4 text-xs font-bold text-zinc-400 tracking-wider uppercase">Total</th>
                          <th className="text-center py-3 px-4 text-xs font-bold text-zinc-400 tracking-wider uppercase">Tipo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {companies.map((company, idx) => {
                          const isRecurrent = Object.keys(grouped[company]).length >= 2;
                          const totalCompany = Object.values(grouped[company]).reduce((s, m) => s + m.total, 0);

                          return (
                            <tr key={company} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${idx % 2 === 0 ? 'bg-zinc-900/50' : 'bg-zinc-900/20'}`}>
                              <td className="py-3 px-4">
                                <div className="font-semibold text-white text-sm">{company}</div>
                              </td>
                              {months.map(m => {
                                const data = grouped[company][m];
                                const hasInvoice = !!data;
                                const isCurrentCol = m === currentMonth;
                                const isMissing = isRecurrent && !hasInvoice && parseInt(m) <= parseInt(currentMonth);

                                return (
                                  <td key={m} className={`py-3 px-4 text-right ${isCurrentCol ? 'bg-cyan-500/5' : ''}`}>
                                    {hasInvoice ? (
                                      <button
                                        onClick={() => {
                                          // Editar la primera factura de ese proveedor/mes
                                          startEditInvoice(data.invoices[0]);
                                        }}
                                        className="group w-full text-right hover:bg-zinc-800/50 rounded px-2 py-1 -mx-2 transition-all"
                                        title={`Editar (${data.count} factura${data.count > 1 ? 's' : ''})`}
                                      >
                                        <p className="text-sm font-bold text-white whitespace-nowrap group-hover:text-cyan-300">{data.total.toFixed(2)}€ ✏️</p>
                                        <p className="text-[10px] text-emerald-400 mt-0.5">✓ {data.count} fact.</p>
                                      </button>
                                    ) : isMissing ? (
                                      <div>
                                        <p className="text-sm text-rose-400 font-semibold">—</p>
                                        <p className="text-[10px] text-rose-400 mt-0.5">⚠ Falta</p>
                                      </div>
                                    ) : (
                                      <p className="text-sm text-zinc-600">—</p>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="py-3 px-4 text-right">
                                <p className="font-bold text-white whitespace-nowrap">{totalCompany.toFixed(2)}€</p>
                              </td>
                              <td className="py-3 px-4 text-center">
                                {isRecurrent ? (
                                  <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[10px] font-bold px-2 py-1 rounded">
                                    ↻ Recurrente
                                  </span>
                                ) : (
                                  <span className="bg-zinc-800 text-zinc-500 border border-zinc-700 text-[10px] font-bold px-2 py-1 rounded">
                                    Único
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-zinc-950 border-t-2 border-zinc-800">
                        <tr>
                          <td className="py-3 px-4 text-sm font-bold text-zinc-400 uppercase tracking-wider">TOTAL</td>
                          {months.map(m => (
                            <td key={m} className={`py-3 px-4 text-right ${m === currentMonth ? 'bg-cyan-500/5' : ''}`}>
                              <p className="text-sm font-bold text-white">{monthTotals[m].toFixed(2)}€</p>
                            </td>
                          ))}
                          <td className="py-3 px-4 text-right">
                            <p className="text-base font-bold text-cyan-400">{Object.values(monthTotals).reduce((s, t) => s + t, 0).toFixed(2)}€</p>
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 px-6">
                    <RefreshCw size={48} className="text-zinc-700 mb-4" />
                    <p className="text-zinc-400 text-lg font-semibold mb-2">No hay suscripciones todavía</p>
                    <p className="text-zinc-500 text-sm">Añade facturas de gastos para ver el análisis aquí</p>
                  </div>
                )}
              </div>

              {/* Leyenda */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <h3 className="text-sm font-bold text-white mb-3">Leyenda</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-1 rounded text-[10px] font-bold">↻ Recurrente</span>
                    <span className="text-zinc-500">Aparece en 2+ meses</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 text-[10px] font-bold">✓ N fact.</span>
                    <span className="text-zinc-500">Facturas registradas</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-rose-400 text-[10px] font-bold">⚠ Falta</span>
                    <span className="text-zinc-500">No registrada (recurrente)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-600 text-[10px] font-bold">—</span>
                    <span className="text-zinc-500">Sin factura</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {activeView === 'categories' && (() => {
          // Obtener meses disponibles
          const availableMonths = Array.from(new Set(
            invoices.map(inv => inv.date.slice(0, 7))
          )).sort().reverse();

          // Filtrar facturas por mes seleccionado
          const filteredByMonth = categoryMonth === 'all'
            ? invoices
            : invoices.filter(inv => inv.date.startsWith(categoryMonth));

          // Calcular totales por categoría (solo gastos)
          const categoryStats = CATEGORIES.map((cat) => {
            const catInvoices = filteredByMonth.filter(i => i.category === cat && i.type === 'expense');
            return {
              cat,
              total: catInvoices.reduce((sum, i) => sum + i.amount, 0),
              count: catInvoices.length,
            };
          }).filter(c => c.count > 0).sort((a, b) => b.total - a.total);

          const totalGastos = categoryStats.reduce((sum, c) => sum + c.total, 0);

          const monthLabel = categoryMonth === 'all'
            ? 'Todos los meses'
            : new Date(categoryMonth + '-01').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

          return (
            <div className="space-y-6">
              {/* Hero Header */}
              <div className="relative bg-gradient-to-br from-zinc-900 via-zinc-900 to-violet-950/30 rounded-2xl p-8 border border-zinc-800 overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-violet-500/5 rounded-full -mr-48 -mt-48 blur-3xl"></div>
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-5">
                    <div className="bg-gradient-to-br from-violet-500 to-purple-600 p-4 rounded-2xl shadow-lg shadow-violet-500/20">
                      <Tag size={32} className="text-white" />
                    </div>
                    <div>
                      <h1 className="text-3xl font-bold text-white tracking-tight">Categorías</h1>
                      <p className="text-zinc-400 text-sm mt-1">Resumen por categoría · <span className="text-violet-400 font-semibold">{monthLabel}</span></p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Filtros de Mes */}
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
                <div className="flex items-center gap-3 mb-4">
                  <Calendar className="text-violet-400" size={18} />
                  <h3 className="text-sm font-bold text-white">Filtrar por Mes</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setCategoryMonth('all')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      categoryMonth === 'all'
                        ? 'bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/20'
                        : 'bg-zinc-950 text-zinc-400 border border-zinc-800 hover:border-zinc-700 hover:text-white'
                    }`}
                  >
                    Todos
                  </button>
                  {availableMonths.map((month) => {
                    const date = new Date(month + '-01');
                    const label = date.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
                    return (
                      <button
                        key={month}
                        onClick={() => setCategoryMonth(month)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
                          categoryMonth === month
                            ? 'bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/20'
                            : 'bg-zinc-950 text-zinc-400 border border-zinc-800 hover:border-zinc-700 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Total */}
              <div className="bg-gradient-to-br from-rose-500/10 to-zinc-900 rounded-xl border border-rose-500/20 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-rose-400 tracking-widest uppercase mb-2">Total Gastos</p>
                    <p className="text-4xl font-bold text-white">{totalGastos.toFixed(2)}€</p>
                    <p className="text-xs text-zinc-500 mt-1">{categoryStats.length} categorías activas</p>
                  </div>
                  <TrendingDown size={48} className="text-rose-400/30" />
                </div>
              </div>

              {/* Categorías con barras de progreso */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {categoryStats.length === 0 ? (
                  <div className="col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
                    <p className="text-zinc-500">No hay datos para el período seleccionado</p>
                  </div>
                ) : (
                  categoryStats.map((c, idx) => {
                    const percentage = totalGastos > 0 ? (c.total / totalGastos) * 100 : 0;
                    const colors = ['emerald', 'blue', 'violet', 'rose', 'orange', 'cyan', 'pink', 'amber', 'teal', 'indigo', 'lime'];
                    const color = colors[idx % colors.length];
                    return (
                      <div key={c.cat} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-all">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full bg-${color}-400`}></div>
                            <p className="text-sm font-bold text-white capitalize">{c.cat}</p>
                          </div>
                          <span className="text-xs text-zinc-500">{c.count} reg.</span>
                        </div>
                        <p className="text-2xl font-bold text-white mb-3">{c.total.toFixed(2)}€</p>
                        <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full bg-gradient-to-r from-${color}-500 to-${color}-400 rounded-full transition-all`}
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                        <p className="text-xs text-zinc-500 mt-2">{percentage.toFixed(1)}% del total</p>
                      </div>
                    );
                  })
                )}
              </div>

              {/* PIE CHART - Distribución visual */}
              {categoryStats.length > 0 && (
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-lg font-bold text-white tracking-tight">Distribución por Categoría</h2>
                      <p className="text-xs text-zinc-500 mt-0.5">Vista circular · {monthLabel}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                    {/* Pie Chart */}
                    <ResponsiveContainer width="100%" height={400}>
                      <PieChart>
                        <Pie
                          data={categoryStats.map(c => ({ name: c.cat, value: c.total }))}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius={130}
                          innerRadius={60}
                          fill="#10b981"
                          dataKey="value"
                          paddingAngle={2}
                        >
                          {categoryStats.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={['#10b981', '#3b82f6', '#8b5cf6', '#f43f5e', '#f97316', '#06b6d4', '#ec4899', '#f59e0b', '#14b8a6', '#6366f1', '#84cc16'][index % 11]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', color: '#fff' }} formatter={(value: any) => typeof value === 'number' ? `${value.toFixed(2)}€` : value} />
                      </PieChart>
                    </ResponsiveContainer>

                    {/* Legend */}
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                      {categoryStats.map((c, idx) => {
                        const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f43f5e', '#f97316', '#06b6d4', '#ec4899', '#f59e0b', '#14b8a6', '#6366f1', '#84cc16'];
                        const percentage = totalGastos > 0 ? (c.total / totalGastos) * 100 : 0;
                        return (
                          <div key={c.cat} className="flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded-lg p-3 hover:border-zinc-700 transition-all">
                            <div className="flex items-center gap-3">
                              <div className="w-4 h-4 rounded" style={{ backgroundColor: colors[idx % 11] }}></div>
                              <div>
                                <p className="text-sm font-semibold text-white capitalize">{c.cat}</p>
                                <p className="text-xs text-zinc-500">{c.count} registros</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-white">{c.total.toFixed(2)}€</p>
                              <p className="text-xs text-zinc-500">{percentage.toFixed(1)}%</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {activeView === 'settings' && (
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8">
            <h1 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <Settings className="text-blue-400" /> Configuración
            </h1>
            <p className="text-zinc-400">Próximamente más opciones de configuración</p>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-zinc-900 border border-blue-500/20 rounded-lg p-4">
                <p className="text-sm text-zinc-400">Total Registros</p>
                <p className="text-2xl font-bold text-blue-400">{invoices.length}</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-zinc-400">Total Ingresos</p>
                <p className="text-2xl font-bold text-emerald-400">{invoices.filter(i => i.type === 'income').length}</p>
              </div>
              <div className="bg-zinc-900 border border-rose-500/20 rounded-lg p-4">
                <p className="text-sm text-zinc-400">Total Gastos</p>
                <p className="text-2xl font-bold text-rose-400">{invoices.filter(i => i.type === 'expense').length}</p>
              </div>
            </div>
          </div>
        )}

        {activeView === 'dashboard' && (
        <>


        {/* Filters for Charts Section */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white">🎯 Filtros para Gráficos y Métricas</h3>
            <div className="flex gap-2 items-center">
              {/* Mostrar si hay cambios respecto al default (mes actual hasta hoy) */}
              {(chartDateFrom !== _firstDay || chartDateTo !== _todayStr || chartFilterType !== 'all') && (
                <button
                  onClick={() => {
                    const range = getCurrentMonthRange();
                    setChartDateFrom(range.firstDay);
                    setChartDateTo(range.todayStr);
                    setChartFilterType('all');
                  }}
                  className="text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 font-semibold flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all"
                >
                  <X size={12} />
                  Volver al mes actual
                </button>
              )}
              {/* Botón para ver TODO el histórico */}
              <button
                onClick={() => {
                  setChartDateFrom('');
                  setChartDateTo('');
                  setChartFilterType('all');
                }}
                className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 font-semibold flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all"
              >
                <Filter size={12} />
                Ver todos
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-white block mb-2">Desde</label>
              <input
                type="date"
                value={chartDateFrom}
                onChange={(e) => setChartDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm text-white bg-zinc-950"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-white block mb-2">Hasta</label>
              <input
                type="date"
                value={chartDateTo}
                onChange={(e) => setChartDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm text-white bg-zinc-950"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-white block mb-2">Tipo</label>
              <select
                value={chartFilterType}
                onChange={(e) => setChartFilterType(e.target.value as any)}
                className="w-full px-3 py-2 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm text-white bg-zinc-950"
              >
                <option value="all">Todos</option>
                <option value="income">Ingresos</option>
                <option value="expense">Gastos</option>
              </select>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Ingresos */}
          <div className="bg-gradient-to-br from-emerald-500/10 to-zinc-900 rounded-xl border border-emerald-500/20 p-6 hover:border-emerald-500/40 transition-all relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full -mr-16 -mt-16 group-hover:bg-emerald-500/10 transition-all"></div>
            <div className="flex items-center justify-between mb-4 relative">
              <p className="text-xs font-bold text-emerald-400 tracking-wider uppercase">Ingresos</p>
              <div className="bg-emerald-500/20 p-2.5 rounded-lg border border-emerald-500/30">
                <TrendingUp size={20} className="text-emerald-400" />
              </div>
            </div>
            <p className="text-3xl font-bold text-white relative">{chartMetrics.totalIncome.toFixed(2)}€</p>
            <p className="text-xs text-zinc-500 mt-2 relative">{chartMetrics.incomeCount} registros</p>
          </div>

          {/* Gastos */}
          <div className="bg-gradient-to-br from-rose-500/10 to-zinc-900 rounded-xl border border-rose-500/20 p-6 hover:border-rose-500/40 transition-all relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full -mr-16 -mt-16 group-hover:bg-rose-500/10 transition-all"></div>
            <div className="flex items-center justify-between mb-4 relative">
              <p className="text-xs font-bold text-rose-400 tracking-wider uppercase">Gastos</p>
              <div className="bg-rose-500/20 p-2.5 rounded-lg border border-rose-500/30">
                <TrendingDown size={20} className="text-rose-400" />
              </div>
            </div>
            <p className="text-3xl font-bold text-white relative">{chartMetrics.totalExpenses.toFixed(2)}€</p>
            <p className="text-xs text-zinc-500 mt-2 relative">{chartMetrics.expenseCount} registros</p>
          </div>

          {/* Balance */}
          <div className={`bg-gradient-to-br ${chartMetrics.totalBalance >= 0 ? 'from-blue-500/10' : 'from-orange-500/10'} to-zinc-900 rounded-xl border ${chartMetrics.totalBalance >= 0 ? 'border-blue-500/20 hover:border-blue-500/40' : 'border-orange-500/20 hover:border-orange-500/40'} p-6 transition-all relative overflow-hidden group`}>
            <div className={`absolute top-0 right-0 w-32 h-32 ${chartMetrics.totalBalance >= 0 ? 'bg-blue-500/5' : 'bg-orange-500/5'} rounded-full -mr-16 -mt-16 transition-all`}></div>
            <div className="flex items-center justify-between mb-4 relative">
              <p className={`text-xs font-bold ${chartMetrics.totalBalance >= 0 ? 'text-blue-400' : 'text-orange-400'} tracking-wider uppercase`}>Balance</p>
              <div className={`p-2.5 rounded-lg border ${chartMetrics.totalBalance >= 0 ? 'bg-blue-500/20 border-blue-500/30' : 'bg-orange-500/20 border-orange-500/30'}`}>
                <DollarSign size={20} className={chartMetrics.totalBalance >= 0 ? 'text-blue-400' : 'text-orange-400'} />
              </div>
            </div>
            <p className={`text-3xl font-bold ${chartMetrics.totalBalance >= 0 ? 'text-blue-400' : 'text-orange-400'} relative`}>
              {chartMetrics.totalBalance.toFixed(2)}€
            </p>
            <p className="text-xs text-zinc-500 mt-2 relative">{chartMetrics.totalBalance >= 0 ? '↗ Positivo' : '↘ Negativo'}</p>
          </div>

          {/* Total Registros */}
          <div className="bg-gradient-to-br from-violet-600 via-violet-700 to-indigo-800 rounded-xl p-6 text-white hover:scale-[1.02] transition-all relative overflow-hidden group shadow-lg shadow-violet-500/20">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 group-hover:bg-white/10 transition-all"></div>
            <div className="flex items-center justify-between mb-4 relative">
              <p className="text-xs font-bold tracking-wider uppercase opacity-90">Total Sistema</p>
              <div className="bg-white/20 p-2.5 rounded-lg border border-white/30 backdrop-blur-sm">
                <Filter size={20} />
              </div>
            </div>
            <p className="text-3xl font-bold relative">{invoices.length}</p>
            <p className="text-xs opacity-75 mt-2 relative">Registros totales</p>
          </div>
        </div>

        {/* Charts */}
        {monthlyTrend.length > 0 && (
          <div className="grid grid-cols-1 gap-8 mb-8">
            {/* Tendencia Mensual */}
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-white">Tendencia Mensual</h2>
                <div className="flex gap-2 bg-zinc-800 p-1 rounded-lg">
                  <button
                    onClick={() => setTrendRange('currentMonth')}
                    className={`px-4 py-2 rounded-md font-semibold text-sm transition-all ${
                      trendRange === 'currentMonth'
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Mes
                  </button>
                  <button
                    onClick={() => setTrendRange('30days')}
                    className={`px-4 py-2 rounded-md font-semibold text-sm transition-all ${
                      trendRange === '30days'
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    30 días
                  </button>
                  <button
                    onClick={() => setTrendRange('90days')}
                    className={`px-4 py-2 rounded-md font-semibold text-sm transition-all ${
                      trendRange === '90days'
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    90 días
                  </button>
                  <button
                    onClick={() => setTrendRange('ytd')}
                    className={`px-4 py-2 rounded-md font-semibold text-sm transition-all ${
                      trendRange === 'ytd'
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Año
                  </button>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="month" stroke="#71717a" />
                  <YAxis stroke="#71717a" tickFormatter={(v: number) => `${Math.round(v)}€`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', color: '#fff' }}
                    formatter={(value: any) => [`${Math.round(Number(value) * 100) / 100}€`]}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="income" stroke="#16a34a" strokeWidth={2} dot={{ fill: '#16a34a' }} name="Ingresos" />
                  <Line type="monotone" dataKey="expenses" stroke="#dc2626" strokeWidth={2} dot={{ fill: '#dc2626' }} name="Gastos" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Gastos por Categoría */}
            {categoryExpenses.length > 0 && (
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-lg font-bold text-white">Gastos por Categoría</h2>
                  <div className="flex gap-3 bg-zinc-800 p-1 rounded-lg">
                    <button
                      onClick={() => setCategoryChartType('bar')}
                      className={`px-5 py-2 rounded-md font-semibold text-sm transition-all ${
                        categoryChartType === 'bar'
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      📊 Barras
                    </button>
                    <button
                      onClick={() => setCategoryChartType('pie')}
                      className={`px-5 py-2 rounded-md font-semibold text-sm transition-all ${
                        categoryChartType === 'pie'
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      🥧 Circular
                    </button>
                  </div>
                </div>

                {categoryChartType === 'bar' ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={categoryExpenses}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="name" stroke="#71717a" angle={-45} textAnchor="end" height={100} />
                      <YAxis stroke="#71717a" />
                      <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', color: '#fff' }} />
                      <Bar dataKey="value" fill="#2563eb" name="Monto (€)" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div>
                    <ResponsiveContainer width="100%" height={400}>
                      <PieChart>
                        <Pie
                          data={categoryExpenses}
                          cx="50%"
                          cy="45%"
                          labelLine={false}
                          outerRadius={80}
                          fill="#2563eb"
                          dataKey="value"
                        >
                          {categoryExpenses.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={['#2563eb', '#16a34a', '#dc2626', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1', '#0891b2', '#059669', '#d97706', '#7c3aed'][index % 11]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', color: '#fff' }} formatter={(value: any) => typeof value === 'number' ? `${value.toFixed(2)}€` : value} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-6 grid grid-cols-2 gap-3">
                      {categoryExpenses.map((item, index) => (
                        <div key={item.name} className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{
                              backgroundColor: ['#2563eb', '#16a34a', '#dc2626', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1', '#0891b2', '#059669', '#d97706', '#7c3aed'][index % 11]
                            }}
                          />
                          <span className="text-sm text-zinc-300">
                            <strong>{item.name}</strong>: {item.value.toFixed(2)}€
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        </>
        )}

        {/* TRANSACCIONES VIEW */}
        {activeView === 'transactions' && (
        <>
        {/* Hero Header de Transacciones */}
        <div className="relative bg-gradient-to-br from-zinc-900 via-zinc-900 to-blue-950/30 rounded-2xl p-8 border border-zinc-800 overflow-hidden mb-8">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full -mr-48 -mt-48 blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/5 rounded-full -ml-32 -mb-32 blur-3xl"></div>
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-4 rounded-2xl shadow-lg shadow-blue-500/20">
                <Receipt size={32} className="text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white tracking-tight">Transacciones</h1>
                <p className="text-zinc-400 text-sm mt-1">Mostrando: <span className="text-blue-400 font-semibold">{new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</span> · {filteredInvoices.length} registros</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowImportDialog(true)}
                className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 font-medium py-2 px-4 rounded-lg flex items-center gap-2 transition-all text-sm"
              >
                <FileUp size={16} />
                Importar CSV
              </button>
              <button
                onClick={() => openIncomeDialog()}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-medium py-2 px-4 rounded-lg flex items-center gap-2 transition-all text-sm shadow-lg shadow-emerald-500/20"
              >
                <TrendingUp size={16} />
                Ingreso
              </button>
              <button
                onClick={() => openExpenseDialog()}
                className="bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-medium py-2 px-4 rounded-lg flex items-center gap-2 transition-all text-sm shadow-lg shadow-rose-500/20"
              >
                <TrendingDown size={16} />
                Gasto
              </button>
            </div>
          </div>
        </div>

        {/* Filters Section */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Filter size={24} className="text-blue-400" />
              Filtros y Búsqueda
            </h2>
            <div className="flex gap-2 items-center">
              {/* Mostrar si hay cambios respecto al default (mes actual) */}
              {(searchText || dateFrom !== firstDayOfMonth || dateTo !== lastDayOfMonth || filterType !== 'all' || filterCategory !== 'all' || sortBy !== 'date-desc') && (
                <button
                  onClick={clearFilters}
                  className="text-sm bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 font-semibold flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all"
                >
                  <X size={14} />
                  Volver al mes actual
                </button>
              )}
              {/* Botón para ver TODOS los registros */}
              <button
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                  setFilterType('all');
                  setFilterCategory('all');
                  setSearchText('');
                  setSortBy('date-desc');
                }}
                className="text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 font-semibold flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all"
              >
                <Filter size={14} />
                Ver todos
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="mb-6">
            <div className="relative">
              <Search size={20} className="absolute left-3 top-3 text-zinc-600" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Buscar por empresa, factura o categoría..."
                className="w-full pl-10 pr-4 py-3 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white bg-zinc-950 placeholder:text-zinc-500"
              />
            </div>
          </div>

          {/* Filter Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Fecha Desde */}
            <div>
              <label className="block text-sm font-semibold text-zinc-300 mb-2">Desde</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFromSafe(e.target.value)}
                className="w-full px-4 py-2 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white bg-zinc-950"
              />
            </div>

            {/* Fecha Hasta */}
            <div>
              <label className="block text-sm font-semibold text-zinc-300 mb-2">Hasta</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateToSafe(e.target.value)}
                className="w-full px-4 py-2 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white bg-zinc-950"
              />
            </div>

            {/* Tipo */}
            <div>
              <label className="block text-sm font-semibold text-zinc-300 mb-2">Tipo</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="w-full px-4 py-2 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white bg-zinc-950"
              >
                <option value="all">Todos</option>
                <option value="income">Ingresos</option>
                <option value="expense">Gastos</option>
              </select>
            </div>

            {/* Categoría */}
            <div>
              <label className="block text-sm font-semibold text-zinc-300 mb-2">Categoría</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-4 py-2 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white bg-zinc-950"
              >
                <option value="all">Todas</option>
                <option value="Ingreso">Ingreso</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Ordenar */}
            <div>
              <label className="block text-sm font-semibold text-zinc-300 mb-2">Ordenar por</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full px-4 py-2 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white bg-zinc-950"
              >
                <option value="date-desc">Fecha (Reciente)</option>
                <option value="date-asc">Fecha (Antiguo)</option>
                <option value="amount-desc">Monto (Mayor)</option>
                <option value="amount-asc">Monto (Menor)</option>
              </select>
            </div>
          </div>

          {/* Results Summary */}
          <div className="mt-6 pt-6 border-t border-zinc-800">
            <p className="text-sm text-zinc-400">
              <span className="font-bold text-blue-400 text-base">{filteredInvoices.length}</span> registros encontrados
            </p>
          </div>
        </div>

        {/* Quick Add Buttons */}
        <div className="bg-gradient-to-r from-zinc-900 to-zinc-900/50 rounded-xl border border-zinc-800 p-5 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                <Plus size={18} className="text-emerald-400" />
                Añadir Transacción Manual
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">Registra rápidamente un nuevo ingreso o gasto</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => openIncomeDialog()}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold py-2.5 px-5 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 hover:scale-[1.02]"
              >
                <TrendingUp size={18} />
                <span>Ingreso</span>
              </button>
              <button
                onClick={() => openExpenseDialog()}
                className="bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-semibold py-2.5 px-5 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-rose-500/20 hover:scale-[1.02]"
              >
                <TrendingDown size={18} />
                <span>Gasto</span>
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Historial de Transacciones</h2>
            <span className="text-xs text-zinc-500">{filteredInvoices.length} registros</span>
          </div>

          {filteredInvoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-zinc-950 border-b border-zinc-800">
                  <tr>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-zinc-300">Tipo</th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-zinc-300">Descripción</th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-zinc-300">Categoría</th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-zinc-300">Método</th>
                    <th className="text-right py-4 px-6 text-sm font-semibold text-zinc-300">Monto</th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-zinc-300">Fecha</th>
                    <th className="text-center py-4 px-6 text-sm font-semibold text-zinc-300" title="Marcar si tiene factura para contabilidad">📄 Factura</th>
                    <th className="text-center py-4 px-6 text-sm font-semibold text-zinc-300">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((invoice, idx) => (
                    <tr
                      key={invoice.id}
                      className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${idx % 2 === 0 ? 'bg-zinc-900/50' : 'bg-zinc-900/20'}`}
                    >
                      <td className="py-4 px-6">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
                            invoice.type === 'income'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {invoice.type === 'income' ? '↓ Ingreso' : '↑ Gasto'}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <div className="font-semibold text-white text-sm">{invoice.company}</div>
                        <div className="text-xs text-zinc-500">{invoice.number}</div>
                      </td>
                      <td className="py-4 px-6">
                        <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1 rounded-full text-xs font-medium">
                          {invoice.category}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <span className="bg-violet-500/10 text-violet-400 border border-violet-500/20 px-3 py-1 rounded-full text-xs font-medium">
                          {invoice.method}
                        </span>
                      </td>
                      <td className={`py-4 px-6 text-right font-bold text-sm ${
                        invoice.type === 'income' ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {invoice.type === 'income' ? '+' : '-'}{invoice.amount.toFixed(2)}€
                      </td>
                      <td className="py-4 px-6 text-zinc-400 text-sm">{invoice.date}</td>
                      <td className="py-4 px-6 text-center">
                        <label className="inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={invoice.hasInvoice || false}
                            onChange={() => toggleInvoice(invoice.id)}
                            className="sr-only peer"
                          />
                          <div className={`w-10 h-5 rounded-full transition-all relative ${
                            invoice.hasInvoice
                              ? 'bg-emerald-500'
                              : 'bg-zinc-700'
                          }`}>
                            <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                              invoice.hasInvoice ? 'translate-x-5' : ''
                            }`}></div>
                          </div>
                        </label>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {invoice.pdfUrl && (
                            <a
                              href={invoice.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 p-2 rounded-lg transition-all"
                              title="Ver PDF"
                            >
                              📎
                            </a>
                          )}
                          <button
                            onClick={() => startEditInvoice(invoice)}
                            className="text-blue-500 hover:text-blue-400 hover:bg-blue-500/10 p-2 rounded-lg transition-all"
                            title="Editar"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => deleteInvoice(invoice.id)}
                            className="text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 p-2 rounded-lg transition-all"
                            title="Eliminar"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <div className="text-center">
                <p className="text-zinc-400 text-lg font-semibold mb-2">No hay registros que coincidan</p>
                <p className="text-zinc-500 text-sm">Intenta cambiar los filtros o importa un CSV</p>
              </div>
            </div>
          )}
        </div>
        </>
        )}
      </div>
      </div>

      {/* Income Dialog - Simplificado */}
      {showIncomeDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-emerald-500/30 rounded-2xl shadow-2xl shadow-emerald-500/10 max-w-md w-full p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-2.5 rounded-xl shadow-lg shadow-emerald-500/20">
                  <TrendingUp size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Nuevo Ingreso</h2>
                  <p className="text-xs text-zinc-500">Registrar entrada de dinero</p>
                </div>
              </div>
              <button
                onClick={() => setShowIncomeDialog(false)}
                className="text-zinc-600 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-all"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              {/* Dropzone PDF - Auto-rellenar con IA */}
              <div className="bg-gradient-to-br from-emerald-500/5 to-zinc-900 border border-dashed border-emerald-500/30 rounded-xl p-4 hover:border-emerald-500/60 transition-all">
                <label className="cursor-pointer block">
                  <div className="flex items-center gap-3">
                    <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-2.5 rounded-lg shadow-lg shadow-emerald-500/20 flex-shrink-0">
                      {analyzingPDF ? (
                        <RefreshCw size={18} className="text-white animate-spin" />
                      ) : (
                        <FileUp size={18} className="text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">
                        {analyzingPDF ? '🤖 Analizando PDF...' : '📄 Subir Factura PDF'}
                      </p>
                      <p className="text-[10px] text-zinc-500 truncate">
                        {analyzingPDF ? 'Extrayendo datos automáticamente...' : 'Se autorrellenarán los campos al subir'}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded">AUTO</span>
                  </div>
                  <input
                    type="file"
                    accept=".pdf"
                    disabled={analyzingPDF}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) analyzePDF(f, 'income');
                    }}
                  />
                </label>
                {pdfAnalysisError && (
                  <p className="text-xs text-rose-400 mt-2 flex items-center gap-1">
                    <AlertCircle size={12} /> {pdfAnalysisError}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2 tracking-wider uppercase">Nº Factura</label>
                  <input
                    type="text"
                    value={formData.number}
                    onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                    placeholder="Ej: 012"
                    className="w-full px-3 py-2.5 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white bg-zinc-950 placeholder:text-zinc-600 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-zinc-400 mb-2 tracking-wider uppercase">Empresa *</label>
                  <input
                    type="text"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    placeholder="Ej: GHL Technologies S.L."
                    className="w-full px-3 py-2.5 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white bg-zinc-950 placeholder:text-zinc-600 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-2 tracking-wider uppercase">Descripción / Concepto</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ej: Servicios de consultoría, Suscripción mensual..."
                  className="w-full px-4 py-2.5 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white bg-zinc-950 placeholder:text-zinc-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2 tracking-wider uppercase">Monto *</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value, amountWithoutVAT: e.target.value })}
                      placeholder="0.00"
                      className="w-full px-4 py-2.5 pr-8 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white bg-zinc-950 placeholder:text-zinc-600"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">€</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2 tracking-wider uppercase">Fecha</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-4 py-2.5 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white bg-zinc-950"
                  />
                </div>
              </div>
              {/* Categoría y Método - preseleccionados pero EDITABLES */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2 tracking-wider uppercase">Categoría</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-2.5 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white bg-zinc-950"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2 tracking-wider uppercase">Método</label>
                  <select
                    value={formData.method}
                    onChange={(e) => setFormData({ ...formData, method: e.target.value })}
                    className="w-full px-4 py-2.5 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white bg-zinc-950"
                  >
                    {METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded-lg cursor-pointer hover:border-emerald-500/30 transition-all">
                <div className="flex items-center gap-3">
                  <FileText size={16} className="text-emerald-400" />
                  <div>
                    <p className="text-sm font-semibold text-white">Tiene factura</p>
                    <p className="text-[10px] text-zinc-500">Incluir en contabilidad fiscal</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={selectedFile !== null}
                  onChange={(e) => setSelectedFile(e.target.checked ? new File([], 'manual') : null)}
                  className="sr-only peer"
                />
                <div className={`w-10 h-5 rounded-full transition-all relative ${selectedFile ? 'bg-emerald-500' : 'bg-zinc-700'}`}>
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all ${selectedFile ? 'translate-x-5' : ''}`}></div>
                </div>
              </label>

              {/* IVA selector - solo si tiene factura */}
              {selectedFile && (
                <div className="bg-gradient-to-br from-amber-500/5 to-zinc-900 border border-amber-500/20 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Percent size={14} className="text-amber-400" />
                    <p className="text-xs font-bold text-amber-400 tracking-wider uppercase">IVA Repercutido</p>
                  </div>
                  <select
                    value={formData.ivaPercent}
                    onChange={(e) => setFormData({ ...formData, ivaPercent: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-white bg-zinc-950 text-sm"
                  >
                    <option value="21">21% (España)</option>
                    <option value="0">0% (Andorra, Dubai, exento)</option>
                  </select>
                  {formData.amount && (
                    <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-zinc-800">
                      <div>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Base</p>
                        <p className="text-sm font-bold text-white">
                          {(parseFloat(formData.amount) / (1 + parseFloat(formData.ivaPercent) / 100)).toFixed(2)}€
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">IVA</p>
                        <p className="text-sm font-bold text-amber-400">
                          {(parseFloat(formData.amount) - parseFloat(formData.amount) / (1 + parseFloat(formData.ivaPercent) / 100)).toFixed(2)}€
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Total</p>
                        <p className="text-sm font-bold text-emerald-400">
                          {parseFloat(formData.amount).toFixed(2)}€
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowIncomeDialog(false)}
                  className="flex-1 px-4 py-2.5 border border-zinc-700 rounded-lg text-zinc-300 font-semibold hover:bg-zinc-800 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleAddInvoice('income')}
                  disabled={isSaving}
                  className={`flex-1 px-4 py-2.5 rounded-lg font-semibold transition-all shadow-lg ${
                    isSaving
                      ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed opacity-60'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-emerald-500/20'
                  }`}
                >
                  {isSaving ? '⏳ Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expense Dialog */}
      {showExpenseDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-w-md w-full p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-rose-500 to-pink-600 p-2.5 rounded-xl shadow-lg shadow-rose-500/20">
                  <TrendingDown size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Nuevo Gasto</h2>
                  <p className="text-xs text-zinc-500">Registrar salida de dinero</p>
                </div>
              </div>
              <button
                onClick={() => setShowExpenseDialog(false)}
                className="text-zinc-600 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-all"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              {/* DUAL Dropzone: PDF + FOTO (Mobile) */}
              <div className="grid grid-cols-2 gap-2">
                {/* PDF */}
                <label className="cursor-pointer bg-gradient-to-br from-rose-500/5 to-zinc-900 border border-dashed border-rose-500/30 rounded-xl p-3 hover:border-rose-500/60 transition-all flex flex-col items-center justify-center gap-2 min-h-[100px]">
                  <div className="bg-gradient-to-br from-rose-500 to-pink-600 p-2 rounded-lg shadow-lg shadow-rose-500/20">
                    {analyzingPDF ? (
                      <RefreshCw size={18} className="text-white animate-spin" />
                    ) : (
                      <FileUp size={18} className="text-white" />
                    )}
                  </div>
                  <p className="text-xs font-semibold text-white text-center">
                    📄 Subir PDF
                  </p>
                  <p className="text-[9px] text-zinc-500 text-center">Auto-rellena</p>
                  <input
                    type="file"
                    accept=".pdf"
                    disabled={analyzingPDF}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) analyzePDF(f, 'expense');
                    }}
                  />
                </label>

                {/* FOTO (cámara móvil) */}
                <label className="cursor-pointer bg-gradient-to-br from-blue-500/5 to-zinc-900 border border-dashed border-blue-500/30 rounded-xl p-3 hover:border-blue-500/60 transition-all flex flex-col items-center justify-center gap-2 min-h-[100px]">
                  <div className="bg-gradient-to-br from-blue-500 to-cyan-600 p-2 rounded-lg shadow-lg shadow-blue-500/20">
                    {analyzingPDF ? (
                      <RefreshCw size={18} className="text-white animate-spin" />
                    ) : (
                      <Camera size={18} className="text-white" />
                    )}
                  </div>
                  <p className="text-xs font-semibold text-white text-center">
                    📸 Hacer Foto
                  </p>
                  <p className="text-[9px] text-zinc-500 text-center">Cámara → PDF</p>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={analyzingPDF}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handlePhotoUpload(f, 'expense');
                    }}
                  />
                </label>
              </div>
              {pdfAnalysisError && (
                <p className="text-xs text-rose-400 flex items-center gap-1">
                  <AlertCircle size={12} /> {pdfAnalysisError}
                </p>
              )}

              {/* Banner Nº Factura Automático */}
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-wider uppercase text-emerald-400">Nº Factura Auto</span>
                </div>
                <span className="text-base font-bold text-white tabular-nums">
                  {getNextExpenseNumber(formData.date)}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-2 tracking-wider uppercase">Empresa *</label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="Ej: Mercadona, Spotify..."
                  className="w-full px-3 py-2.5 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 text-white bg-zinc-950 placeholder:text-zinc-600 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-2 tracking-wider uppercase">Descripción / Concepto</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ej: Compra mensual, Gasolina..."
                  className="w-full px-4 py-2.5 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 text-white bg-zinc-950 placeholder:text-zinc-600"
                />
              </div>

              {/* Monto en fila propia - con más espacio */}
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-2 tracking-wider uppercase">Monto *</label>
                <div className="flex gap-2 items-stretch">
                  <select
                    value={(formData as any).currency || 'EUR'}
                    onChange={(e) => setFormData({ ...formData, amount: '', amountWithoutVAT: '', currency: e.target.value } as any)}
                    className="px-3 py-2.5 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 text-white bg-zinc-800 text-sm font-bold w-[90px]"
                  >
                    <option value="EUR">🇪🇺 EUR</option>
                    <option value="USD">🇺🇸 USD</option>
                  </select>
                  <div className="relative flex-1">
                    <input
                      type="number"
                      step="0.01"
                      value={(formData as any).currency === 'USD' ? ((formData as any)._usdRaw || '') : formData.amount}
                      onChange={(e) => {
                        const val = e.target.value;
                        const isUSD = (formData as any).currency === 'USD';
                        if (isUSD) {
                          const eur = val ? String(Math.round((parseFloat(val) / 1.15) * 100) / 100) : '';
                          setFormData({ ...formData, amount: eur, amountWithoutVAT: eur, _usdRaw: val } as any);
                        } else {
                          setFormData({ ...formData, amount: val, amountWithoutVAT: val });
                        }
                      }}
                      placeholder="0.00"
                      className="w-full px-4 py-2.5 pr-10 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 text-white bg-zinc-950 placeholder:text-zinc-600 text-base font-semibold"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-base font-bold pointer-events-none">
                      {(formData as any).currency === 'USD' ? '$' : '€'}
                    </span>
                  </div>
                </div>
                {(formData as any).currency === 'USD' && (formData as any)._usdRaw && (
                  <div className="mt-2 flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                    <span className="text-amber-400 text-sm font-bold">{parseFloat((formData as any)._usdRaw || 0).toFixed(2)}$</span>
                    <span className="text-zinc-500 text-xs">÷ 1.15 =</span>
                    <span className="text-emerald-400 text-sm font-bold">{parseFloat(formData.amount || '0').toFixed(2)}€</span>
                    <span className="text-zinc-600 text-[10px] ml-auto">se guardará en EUR</span>
                  </div>
                )}
              </div>

              {/* Fecha en fila propia */}
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-2 tracking-wider uppercase">Fecha</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 text-white bg-zinc-950"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2 tracking-wider uppercase">Categoría</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-2.5 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 text-white bg-zinc-950"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2 tracking-wider uppercase">Método</label>
                  <select
                    value={formData.method}
                    onChange={(e) => setFormData({ ...formData, method: e.target.value })}
                    className="w-full px-4 py-2.5 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 text-white bg-zinc-950"
                  >
                    {METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded-lg cursor-pointer hover:border-rose-500/30 transition-all">
                <div className="flex items-center gap-3">
                  <FileText size={16} className="text-rose-400" />
                  <div>
                    <p className="text-sm font-semibold text-white">Tiene factura</p>
                    <p className="text-[10px] text-zinc-500">Incluir en contabilidad fiscal</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={selectedFile !== null}
                  onChange={(e) => setSelectedFile(e.target.checked ? new File([], 'manual') : null)}
                  className="sr-only peer"
                />
                <div className={`w-10 h-5 rounded-full transition-all relative ${selectedFile ? 'bg-rose-500' : 'bg-zinc-700'}`}>
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all ${selectedFile ? 'translate-x-5' : ''}`}></div>
                </div>
              </label>

              {/* IVA selector - solo si tiene factura */}
              {selectedFile && (
                <div className="bg-gradient-to-br from-amber-500/5 to-zinc-900 border border-amber-500/20 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Percent size={14} className="text-amber-400" />
                    <p className="text-xs font-bold text-amber-400 tracking-wider uppercase">IVA Soportado</p>
                  </div>
                  <select
                    value={formData.ivaPercent}
                    onChange={(e) => setFormData({ ...formData, ivaPercent: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-white bg-zinc-950 text-sm"
                  >
                    <option value="21">21% (España)</option>
                    <option value="0">0% (Andorra, Dubai, exento)</option>
                  </select>
                  {formData.amount && (
                    <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-zinc-800">
                      <div>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Base</p>
                        <p className="text-sm font-bold text-white">
                          {(parseFloat(formData.amount) / (1 + parseFloat(formData.ivaPercent) / 100)).toFixed(2)}€
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">IVA</p>
                        <p className="text-sm font-bold text-amber-400">
                          {(parseFloat(formData.amount) - parseFloat(formData.amount) / (1 + parseFloat(formData.ivaPercent) / 100)).toFixed(2)}€
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Total</p>
                        <p className="text-sm font-bold text-rose-400">
                          {parseFloat(formData.amount).toFixed(2)}€
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowExpenseDialog(false)}
                  className="flex-1 px-4 py-2.5 border border-zinc-700 rounded-lg text-zinc-300 font-semibold hover:bg-zinc-800 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleAddInvoice('expense')}
                  disabled={isSaving}
                  className={`flex-1 px-4 py-2.5 rounded-lg font-semibold transition-all shadow-lg ${
                    isSaving
                      ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed opacity-60'
                      : 'bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white shadow-rose-500/20'
                  }`}
                >
                  {isSaving ? '⏳ Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      {showEditDialog && editingId && (() => {
        const editingInvoice = invoices.find(i => i.id === editingId);
        const isIncome = editingInvoice?.type === 'income';
        const ringColor = isIncome ? 'emerald' : 'rose';
        return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className={`bg-zinc-900 border border-${ringColor}-500/30 rounded-2xl shadow-2xl shadow-${ringColor}-500/10 max-w-md w-full p-8`}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={`bg-gradient-to-br from-${ringColor}-500 to-${isIncome ? 'teal' : 'pink'}-600 p-2.5 rounded-xl shadow-lg shadow-${ringColor}-500/20`}>
                  {isIncome ? <TrendingUp size={20} className="text-white" /> : <TrendingDown size={20} className="text-white" />}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Editar {isIncome ? 'Ingreso' : 'Gasto'}</h2>
                  <p className="text-xs text-zinc-500">Modificar registro</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowEditDialog(false);
                  setEditingId(null);
                }}
                className="text-zinc-600 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-all"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2 tracking-wider uppercase">Nº Factura</label>
                  <input
                    type="text"
                    value={formData.number}
                    onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                    placeholder="012"
                    className={`w-full px-3 py-2.5 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-${ringColor}-500 text-white bg-zinc-950 text-sm`}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-zinc-400 mb-2 tracking-wider uppercase">Empresa</label>
                  <input
                    type="text"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    placeholder="Nombre empresa"
                    className={`w-full px-3 py-2.5 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-${ringColor}-500 text-white bg-zinc-950 text-sm`}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-2 tracking-wider uppercase">Descripción / Concepto</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Concepto facturado"
                  className={`w-full px-4 py-2.5 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-${ringColor}-500 text-white bg-zinc-950`}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2 tracking-wider uppercase">Monto</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      className={`w-full px-4 py-2.5 pr-8 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-${ringColor}-500 text-white bg-zinc-950`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">€</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2 tracking-wider uppercase">Fecha</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className={`w-full px-4 py-2.5 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-${ringColor}-500 text-white bg-zinc-950`}
                  />
                </div>
              </div>
              {/* Para INGRESOS: mostrar etiquetas fijas (work + Transferencia) */}
              {isIncome ? (
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 flex items-center gap-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-500 uppercase tracking-wider">Categoría:</span>
                    <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-semibold">work</span>
                  </div>
                  <span className="text-zinc-700">·</span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-500 uppercase tracking-wider">Método:</span>
                    <span className="bg-violet-500/10 text-violet-400 border border-violet-500/20 px-2 py-0.5 rounded-full font-semibold">Transferencia</span>
                  </div>
                </div>
              ) : (
                /* Para GASTOS: mostrar selectores normales */
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2 tracking-wider uppercase">Categoría</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className={`w-full px-4 py-2.5 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-${ringColor}-500 text-white bg-zinc-950`}
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2 tracking-wider uppercase">Método</label>
                    <select
                      value={formData.method}
                      onChange={(e) => setFormData({ ...formData, method: e.target.value })}
                      className={`w-full px-4 py-2.5 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-${ringColor}-500 text-white bg-zinc-950`}
                    >
                      {METHODS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Toggle Tiene factura */}
              <label className={`flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded-lg cursor-pointer hover:border-${ringColor}-500/30 transition-all`}>
                <div className="flex items-center gap-3">
                  <FileText size={16} className={`text-${ringColor}-400`} />
                  <div>
                    <p className="text-sm font-semibold text-white">Tiene factura</p>
                    <p className="text-[10px] text-zinc-500">Incluir en contabilidad fiscal</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={selectedFile !== null}
                  onChange={(e) => setSelectedFile(e.target.checked ? new File([], 'manual') : null)}
                  className="sr-only peer"
                />
                <div className={`w-10 h-5 rounded-full transition-all relative ${selectedFile ? `bg-${ringColor}-500` : 'bg-zinc-700'}`}>
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all ${selectedFile ? 'translate-x-5' : ''}`}></div>
                </div>
              </label>

              {/* IVA selector - solo si tiene factura */}
              {selectedFile && (
                <div className="bg-gradient-to-br from-amber-500/5 to-zinc-900 border border-amber-500/20 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Percent size={14} className="text-amber-400" />
                    <p className="text-xs font-bold text-amber-400 tracking-wider uppercase">{isIncome ? 'IVA Repercutido' : 'IVA Soportado'}</p>
                  </div>
                  <select
                    value={formData.ivaPercent}
                    onChange={(e) => setFormData({ ...formData, ivaPercent: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-white bg-zinc-950 text-sm"
                  >
                    <option value="21">21% (España)</option>
                    <option value="0">0% (Andorra, Dubai, exento)</option>
                  </select>
                  {formData.amount && (
                    <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-zinc-800">
                      <div>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Base</p>
                        <p className="text-sm font-bold text-white">
                          {(parseFloat(formData.amount) / (1 + parseFloat(formData.ivaPercent) / 100)).toFixed(2)}€
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">IVA</p>
                        <p className="text-sm font-bold text-amber-400">
                          {(parseFloat(formData.amount) - parseFloat(formData.amount) / (1 + parseFloat(formData.ivaPercent) / 100)).toFixed(2)}€
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Total</p>
                        <p className={`text-sm font-bold text-${ringColor}-400`}>
                          {parseFloat(formData.amount).toFixed(2)}€
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowEditDialog(false);
                    setEditingId(null);
                  }}
                  className="flex-1 px-4 py-2.5 border border-zinc-700 rounded-lg text-zinc-300 font-semibold hover:bg-zinc-800 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveEditInvoice}
                  className={`flex-1 px-4 py-2.5 bg-gradient-to-r from-${ringColor}-500 to-${isIncome ? 'teal' : 'pink'}-600 hover:from-${ringColor}-600 hover:to-${isIncome ? 'teal' : 'pink'}-700 text-white rounded-lg font-semibold transition-all shadow-lg shadow-${ringColor}-500/20`}
                >
                  Guardar Cambios
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Import Dialog */}
      {/* Issue Invoice Dialog - Emitir nueva factura */}
      {showIssueDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-zinc-900 border border-blue-500/30 rounded-2xl shadow-2xl shadow-blue-500/10 max-w-2xl w-full p-8 my-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2.5 rounded-xl shadow-lg shadow-blue-500/20">
                  <FileText size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Emitir Nueva Factura</h2>
                  <p className="text-xs text-zinc-500">Crear factura para enviar a cliente</p>
                </div>
              </div>
              <button
                onClick={() => setShowIssueDialog(false)}
                className="text-zinc-600 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Info: Datos del emisor + Nº auto */}
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 mb-6">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-blue-400 font-bold tracking-wider uppercase mb-1">Emisor (Tú)</p>
                  <p className="text-white font-semibold">Miguel Ángel Ortiz Cruz</p>
                  <p className="text-zinc-400">NIF: 49549728T</p>
                </div>
                <div className="text-right">
                  <p className="text-blue-400 font-bold tracking-wider uppercase mb-1">Próximo Nº</p>
                  <p className="text-white font-bold text-lg">{String(getNextInvoiceNumber()).padStart(3, '0')}-{new Date().getFullYear()}</p>
                  <p className="text-zinc-400">Fecha: {new Date().toLocaleDateString('es-ES')}</p>
                </div>
              </div>
            </div>

            {/* Datos del Cliente - Un solo bloque */}
            <div className="space-y-2 mb-5">
              <div className="flex items-center justify-between">
                <p className="text-xs text-blue-400 font-bold tracking-wider uppercase">Datos del Cliente *</p>
                <p className="text-[10px] text-zinc-500">Pega o escribe todo el bloque, líneas separadas</p>
              </div>

              <textarea
                value={issueData.clientBlock}
                onChange={(e) => setIssueData({ ...issueData, clientBlock: e.target.value })}
                placeholder={`Ejemplo:\n\nBUSSINESYT FZE\nNº Fiscal: 4531\nBLOCK B Office B23-092 SRTI PARK\nSharjah\nDubái`}
                rows={6}
                className="w-full px-4 py-3 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white bg-zinc-950 placeholder:text-zinc-600 text-sm font-mono resize-none"
              />
              <p className="text-[10px] text-zinc-500 italic">💡 La primera línea será el nombre principal del cliente. El resto se mostrará tal cual en la factura.</p>
            </div>

            {/* Servicio / Concepto */}
            <div className="space-y-3 mb-5">
              <p className="text-xs text-blue-400 font-bold tracking-wider uppercase">Servicio Facturado *</p>

              <textarea
                value={issueData.concept}
                onChange={(e) => setIssueData({ ...issueData, concept: e.target.value })}
                placeholder="Ej: Automatización de mensajes, consultoría técnica, integración de WhatsApp..."
                rows={2}
                className="w-full px-4 py-2.5 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white bg-zinc-950 placeholder:text-zinc-600 text-sm resize-none"
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Unidades</label>
                  <input
                    type="number"
                    value={issueData.units}
                    onChange={(e) => setIssueData({ ...issueData, units: e.target.value })}
                    placeholder="1"
                    className="w-full px-4 py-2.5 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white bg-zinc-950 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Precio Unitario *</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      value={issueData.pricePerUnit}
                      onChange={(e) => setIssueData({ ...issueData, pricePerUnit: e.target.value })}
                      placeholder="170.00"
                      className="w-full px-4 py-2.5 pr-8 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white bg-zinc-950 text-sm"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">€</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Toggle IVA */}
            <label className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded-lg cursor-pointer hover:border-amber-500/30 transition-all mb-4">
              <div className="flex items-center gap-3">
                <Percent size={16} className="text-amber-400" />
                <div>
                  <p className="text-sm font-semibold text-white">¿Aplicar IVA 21%?</p>
                  <p className="text-[10px] text-zinc-500">{issueData.hasIVA ? 'Cliente en España' : 'Cliente extracomunitario (Andorra, Dubai...)'}</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={issueData.hasIVA}
                onChange={(e) => setIssueData({ ...issueData, hasIVA: e.target.checked })}
                className="sr-only peer"
              />
              <div className={`w-10 h-5 rounded-full transition-all relative ${issueData.hasIVA ? 'bg-amber-500' : 'bg-zinc-700'}`}>
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all ${issueData.hasIVA ? 'translate-x-5' : ''}`}></div>
              </div>
            </label>

            {/* Preview Total */}
            {issueData.pricePerUnit && (
              <div className="bg-gradient-to-br from-blue-500/10 to-zinc-900 border border-blue-500/20 rounded-lg p-4 mb-5">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Base</p>
                    <p className="text-sm font-bold text-white">{((parseFloat(issueData.units) || 1) * (parseFloat(issueData.pricePerUnit) || 0)).toFixed(2)}€</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">IVA</p>
                    <p className="text-sm font-bold text-amber-400">{issueData.hasIVA ? (((parseFloat(issueData.units) || 1) * (parseFloat(issueData.pricePerUnit) || 0)) * 0.21).toFixed(2) : '0.00'}€</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Total</p>
                    <p className="text-base font-bold text-emerald-400">
                      {(((parseFloat(issueData.units) || 1) * (parseFloat(issueData.pricePerUnit) || 0)) * (issueData.hasIVA ? 1.21 : 1)).toFixed(2)}€
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Botones */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowIssueDialog(false)}
                className="flex-1 px-4 py-2.5 border border-zinc-700 rounded-lg text-zinc-300 font-semibold hover:bg-zinc-800 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleIssueInvoice}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-lg font-semibold transition-all shadow-lg shadow-blue-500/20"
              >
                ✨ Emitir y Descargar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-w-md w-full p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Importar CSV</h2>
              <button
                onClick={() => {
                  setShowImportDialog(false);
                  setImportMessage('');
                }}
                className="text-zinc-600 hover:text-zinc-400"
              >
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-zinc-400 text-sm">
                Selecciona tu archivo CSV de Google Sheets para importar tus facturas automáticamente.
              </p>
              <div className="border-2 border-dashed border-blue-300 rounded-lg p-6 text-center bg-blue-50">
                <FileUp size={32} className="mx-auto text-blue-400 mb-2" />
                <label className="cursor-pointer">
                  <span className="text-blue-400 font-bold text-sm block">Selecciona un archivo CSV</span>
                  <input
                    ref={csvInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleImportCSV}
                    className="hidden"
                  />
                </label>
              </div>
              {importMessage && (
                <div className={`p-4 rounded-lg text-sm ${importMessage.includes('✅') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {importMessage}
                </div>
              )}
              <div className="bg-zinc-900 border border-blue-500/20 rounded-lg p-4 text-xs text-blue-400">
                <p className="font-semibold mb-2">📋 Pasos:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Abre tu Google Sheet</li>
                  <li>Archivo → Descargar → CSV</li>
                  <li>Selecciona aquí el archivo</li>
                </ol>
              </div>
              <button
                onClick={() => {
                  setShowImportDialog(false);
                  setImportMessage('');
                }}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-2 duration-300">
          <div className={`px-4 py-3 rounded-lg shadow-lg font-semibold text-white flex items-center gap-2 ${
            toastMessage.type === 'error'
              ? 'bg-red-500 border border-red-600'
              : 'bg-emerald-500 border border-emerald-600'
          }`}>
            {toastMessage.type === 'error' ? '❌' : '✅'}
            {toastMessage.text}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <AlertTriangle size={24} className="text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-white">Confirmar eliminación</h3>
            </div>

            <p className="text-zinc-300 text-sm mb-6">
              ¿Estás seguro de que deseas eliminar esta factura? Esta acción no se puede deshacer.
            </p>

            <div className="bg-zinc-800 rounded-lg p-3 mb-6">
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Descripción</p>
              <p className="text-sm text-zinc-200 font-mono">{deleteConfirm.description}</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-zinc-700 rounded-lg text-zinc-300 font-semibold hover:bg-zinc-800 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => confirmDelete()}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-all"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
