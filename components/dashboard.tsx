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
  number: string;
  company: string;
  amount: number;
  amountWithoutVAT: number;
  vat: number;
  date: string;
  fileName: string;
  method: string;
}

const CATEGORIES = ['comidas', 'caballo', 'deporte', 'work', 'ocio', 'caprichos', 'viajes', 'campo', 'regalos', 'coche', 'desayuno'];
const METHODS = ['Tarjeta', 'Efectivo', 'Transferencia', 'Bizum', 'PayPal', 'Otro'];

export default function Dashboard() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showIncomeDialog, setShowIncomeDialog] = useState(false);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Filtros para gráficos y métricas (arriba)
  const [chartDateFrom, setChartDateFrom] = useState<string>('');
  const [chartDateTo, setChartDateTo] = useState<string>('');
  const [chartFilterType, setChartFilterType] = useState<'all' | 'income' | 'expense'>('all');

  // Filtros para tabla (abajo)
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchText, setSearchText] = useState<string>('');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'>('date-desc');

  // Tipo de gráfico para categorías
  const [categoryChartType, setCategoryChartType] = useState<'bar' | 'pie'>('bar');

  // Rango de tiempo para gráfico de tendencia
  const [trendRange, setTrendRange] = useState<'ytd' | '90days' | '30days'>('ytd');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importMessage, setImportMessage] = useState<string>('');
  const [formData, setFormData] = useState({
    number: '',
    company: '',
    amount: '',
    amountWithoutVAT: '',
    category: CATEGORIES[0],
    date: new Date().toISOString().split('T')[0],
    method: METHODS[0],
  });

  // Load invoices from API on mount
  useEffect(() => {
    const loadInvoices = async () => {
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

    loadInvoices();
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
    let startDateStr: string;

    // Calcular fecha de inicio según el rango
    if (trendRange === '30days') {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      startDateStr = d.toISOString().split('T')[0];
    } else if (trendRange === '90days') {
      const d = new Date(today);
      d.setDate(d.getDate() - 90);
      startDateStr = d.toISOString().split('T')[0];
    } else {
      // YTD: desde el 1 de enero del año actual
      startDateStr = `${today.getFullYear()}-01-01`;
    }

    const months = new Map<string, { income: number; expenses: number }>();

    chartFilteredInvoices.forEach((inv) => {
      // Compare dates as strings (YYYY-MM-DD format) for reliability
      if (inv.date >= startDateStr) {
        const monthKey = inv.date.slice(0, 7);
        if (!months.has(monthKey)) {
          months.set(monthKey, { income: 0, expenses: 0 });
        }
        const monthData = months.get(monthKey)!;
        if (inv.type === 'income') {
          monthData.income += inv.amount;
        } else {
          monthData.expenses += inv.amount;
        }
      }
    });

    return Array.from(months.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month: month.slice(5),
        ...data,
      }));
  }, [chartFilteredInvoices, trendRange]);

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

  const handleAddInvoice = (type: 'income' | 'expense') => {
    if (!formData.number || !formData.company || !formData.amount || !selectedFile) {
      alert('Por favor completa todos los campos');
      return;
    }

    const amount = parseFloat(formData.amount);
    const amountWithoutVAT = parseFloat(formData.amountWithoutVAT || formData.amount);
    const vat = amount - amountWithoutVAT;

    const newInvoice: Invoice = {
      id: Date.now().toString(),
      type,
      category: type === 'expense' ? formData.category : 'Ingreso',
      number: formData.number,
      company: formData.company,
      amount,
      amountWithoutVAT,
      vat,
      date: formData.date,
      fileName: selectedFile.name,
      method: formData.method,
    };

    setInvoices([...invoices, newInvoice]);
    setFormData({
      number: '',
      company: '',
      amount: '',
      amountWithoutVAT: '',
      category: CATEGORIES[0],
      date: new Date().toISOString().split('T')[0],
      method: METHODS[0],
    });
    setSelectedFile(null);

    if (type === 'income') {
      setShowIncomeDialog(false);
    } else {
      setShowExpenseDialog(false);
    }
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

  const deleteInvoice = (id: string) => {
    setInvoices(invoices.filter((inv) => inv.id !== id));
  };

  const startEditInvoice = (invoice: Invoice) => {
    setEditingId(invoice.id);
    setFormData({
      number: invoice.number,
      company: invoice.company,
      amount: invoice.amount.toString(),
      amountWithoutVAT: invoice.amountWithoutVAT.toString(),
      category: invoice.category,
      date: invoice.date,
      method: invoice.method || METHODS[0],
    });
    setShowEditDialog(true);
  };

  const saveEditInvoice = () => {
    if (!editingId || !formData.number || !formData.company || !formData.amount) {
      alert('Por favor completa todos los campos');
      return;
    }

    const amount = parseFloat(formData.amount);
    const amountWithoutVAT = parseFloat(formData.amountWithoutVAT || formData.amount);
    const vat = amount - amountWithoutVAT;

    const updated = invoices.map((inv) =>
      inv.id === editingId
        ? {
            ...inv,
            number: formData.number,
            company: formData.company,
            amount,
            amountWithoutVAT,
            vat,
            date: formData.date,
            category: formData.category,
            method: formData.method,
          }
        : inv
    );

    setInvoices(updated);
    setShowEditDialog(false);
    setEditingId(null);
    alert('✅ Registro actualizado correctamente');
    setFormData({
      number: '',
      company: '',
      amount: '',
      amountWithoutVAT: '',
      category: CATEGORIES[0],
      date: new Date().toISOString().split('T')[0],
      method: METHODS[0],
    });
  };

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setFilterType('all');
    setFilterCategory('all');
    setSearchText('');
    setSortBy('date-desc');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white p-3 rounded-lg">
                <DollarSign size={28} />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-black">FinanzApp Pro</h1>
                <p className="text-sm text-gray-500">Gestión de Finanzas Empresariales</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowImportDialog(true)}
                className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold py-2 px-4 rounded-lg flex items-center gap-2 transition-all border border-blue-200"
              >
                <FileUp size={20} />
                Importar CSV
              </button>
              <button
                onClick={() => setShowIncomeDialog(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg flex items-center gap-2 transition-all"
              >
                <Upload size={20} />
                Ingreso
              </button>
              <button
                onClick={() => setShowExpenseDialog(true)}
                className="bg-slate-700 hover:bg-slate-800 text-white font-semibold py-2 px-4 rounded-lg flex items-center gap-2 transition-all"
              >
                <Upload size={20} />
                Gasto
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {loading && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8 text-center">
            <p className="text-blue-700 font-semibold">⏳ Cargando tus datos...</p>
          </div>
        )}

        {/* Filters for Charts Section */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-black">🎯 Filtros para Gráficos y Métricas</h3>
            {(chartDateFrom || chartDateTo || chartFilterType !== 'all') && (
              <button
                onClick={() => {
                  setChartDateFrom('');
                  setChartDateTo('');
                  setChartFilterType('all');
                }}
                className="text-xs text-blue-600 hover:text-blue-700 font-semibold"
              >
                Limpiar filtros
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-black block mb-2">Desde</label>
              <input
                type="date"
                value={chartDateFrom}
                onChange={(e) => setChartDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-black"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-black block mb-2">Hasta</label>
              <input
                type="date"
                value={chartDateTo}
                onChange={(e) => setChartDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-black block mb-2">Tipo</label>
              <select
                value={chartFilterType}
                onChange={(e) => setChartFilterType(e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-black"
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
          <div className="bg-white rounded-lg border border-slate-200 p-6 hover:border-blue-300 transition-all">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-gray-600">INGRESOS</p>
              <div className="bg-green-100 p-2 rounded-lg">
                <TrendingUp size={20} className="text-green-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-black">{chartMetrics.totalIncome.toFixed(2)}€</p>
            <p className="text-xs text-gray-500 mt-2">{chartMetrics.incomeCount} registros</p>
          </div>

          {/* Gastos */}
          <div className="bg-white rounded-lg border border-slate-200 p-6 hover:border-blue-300 transition-all">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-gray-600">GASTOS</p>
              <div className="bg-red-100 p-2 rounded-lg">
                <TrendingDown size={20} className="text-red-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-black">{chartMetrics.totalExpenses.toFixed(2)}€</p>
            <p className="text-xs text-gray-500 mt-2">{chartMetrics.expenseCount} registros</p>
          </div>

          {/* Balance */}
          <div className={`rounded-lg border p-6 transition-all ${chartMetrics.totalBalance >= 0 ? 'bg-blue-50 border-blue-200 hover:border-blue-400' : 'bg-red-50 border-red-200 hover:border-red-400'}`}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-gray-600">BALANCE</p>
              <div className={`p-2 rounded-lg ${chartMetrics.totalBalance >= 0 ? 'bg-blue-100' : 'bg-red-100'}`}>
                <DollarSign size={20} className={chartMetrics.totalBalance >= 0 ? 'text-blue-600' : 'text-red-600'} />
              </div>
            </div>
            <p className={`text-3xl font-bold ${chartMetrics.totalBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              {chartMetrics.totalBalance.toFixed(2)}€
            </p>
            <p className="text-xs text-gray-500 mt-2">{chartMetrics.totalBalance >= 0 ? 'Positivo' : 'Negativo'}</p>
          </div>

          {/* Total Registros */}
          <div className="bg-blue-600 rounded-lg p-6 text-white hover:bg-blue-700 transition-all">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold opacity-90">TOTAL EN SISTEMA</p>
              <div className="bg-white bg-opacity-20 p-2 rounded-lg">
                <Filter size={20} />
              </div>
            </div>
            <p className="text-3xl font-bold">{invoices.length}</p>
            <p className="text-xs opacity-75 mt-2">Todos los registros</p>
          </div>
        </div>

        {/* Charts */}
        {monthlyTrend.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Tendencia Mensual */}
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-black">Tendencia Mensual</h2>
                <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
                  <button
                    onClick={() => setTrendRange('ytd')}
                    className={`px-4 py-2 rounded-md font-semibold text-sm transition-all ${
                      trendRange === 'ytd'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-gray-700 hover:text-gray-900'
                    }`}
                  >
                    Año
                  </button>
                  <button
                    onClick={() => setTrendRange('90days')}
                    className={`px-4 py-2 rounded-md font-semibold text-sm transition-all ${
                      trendRange === '90days'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-gray-700 hover:text-gray-900'
                    }`}
                  >
                    90 días
                  </button>
                  <button
                    onClick={() => setTrendRange('30days')}
                    className={`px-4 py-2 rounded-md font-semibold text-sm transition-all ${
                      trendRange === '30days'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-gray-700 hover:text-gray-900'
                    }`}
                  >
                    30 días
                  </button>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip contentStyle={{ backgroundColor: '#f8fafc', border: 'none', borderRadius: '8px' }} />
                  <Legend />
                  <Line type="monotone" dataKey="income" stroke="#16a34a" strokeWidth={2} dot={{ fill: '#16a34a' }} name="Ingresos" />
                  <Line type="monotone" dataKey="expenses" stroke="#dc2626" strokeWidth={2} dot={{ fill: '#dc2626' }} name="Gastos" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Gastos por Categoría */}
            {categoryExpenses.length > 0 && (
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-lg font-bold text-black">Gastos por Categoría</h2>
                  <div className="flex gap-3 bg-slate-100 p-1 rounded-lg">
                    <button
                      onClick={() => setCategoryChartType('bar')}
                      className={`px-5 py-2 rounded-md font-semibold text-sm transition-all ${
                        categoryChartType === 'bar'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'text-gray-700 hover:text-black'
                      }`}
                    >
                      📊 Barras
                    </button>
                    <button
                      onClick={() => setCategoryChartType('pie')}
                      className={`px-5 py-2 rounded-md font-semibold text-sm transition-all ${
                        categoryChartType === 'pie'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'text-gray-700 hover:text-black'
                      }`}
                    >
                      🥧 Circular
                    </button>
                  </div>
                </div>

                {categoryChartType === 'bar' ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={categoryExpenses}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" stroke="#9ca3af" angle={-45} textAnchor="end" height={100} />
                      <YAxis stroke="#9ca3af" />
                      <Tooltip contentStyle={{ backgroundColor: '#f8fafc', border: 'none', borderRadius: '8px' }} />
                      <Bar dataKey="value" fill="#2563eb" name="Monto (€)" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div>
                    <ResponsiveContainer width="100%" height={300}>
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
                        <Tooltip contentStyle={{ backgroundColor: '#f8fafc', border: 'none', borderRadius: '8px' }} formatter={(value: any) => typeof value === 'number' ? `${value.toFixed(2)}€` : value} />
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
                          <span className="text-sm text-gray-700">
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

        {/* Filters Section */}
        <div className="bg-white rounded-lg border border-slate-200 p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-black flex items-center gap-2">
              <Filter size={24} className="text-blue-600" />
              Filtros y Búsqueda
            </h2>
            {(searchText || dateFrom || dateTo || filterType !== 'all' || filterCategory !== 'all' || sortBy !== 'date-desc') && (
              <button
                onClick={clearFilters}
                className="text-sm text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
              >
                <X size={16} />
                Limpiar filtros
              </button>
            )}
          </div>

          {/* Search */}
          <div className="mb-6">
            <div className="relative">
              <Search size={20} className="absolute left-3 top-3 text-gray-400" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Buscar por empresa, factura o categoría..."
                className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Filter Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Fecha Desde */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Desde</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
              />
            </div>

            {/* Fecha Hasta */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Hasta</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
              />
            </div>

            {/* Tipo */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Tipo</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
              >
                <option value="all">Todos</option>
                <option value="income">Ingresos</option>
                <option value="expense">Gastos</option>
              </select>
            </div>

            {/* Categoría */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Categoría</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
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
              <label className="block text-sm font-semibold text-gray-700 mb-2">Ordenar por</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
              >
                <option value="date-desc">Fecha (Reciente)</option>
                <option value="date-asc">Fecha (Antiguo)</option>
                <option value="amount-desc">Monto (Mayor)</option>
                <option value="amount-asc">Monto (Menor)</option>
              </select>
            </div>
          </div>

          {/* Results Summary */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <p className="text-sm text-gray-600">
              <span className="font-bold text-blue-600 text-base">{filteredInvoices.length}</span> registros encontrados
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h2 className="text-lg font-bold text-black">Historial de Transacciones</h2>
          </div>

          {filteredInvoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-100 border-b border-slate-200">
                  <tr>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Tipo</th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Descripción</th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Categoría</th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Método</th>
                    <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">Monto</th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Fecha</th>
                    <th className="text-center py-4 px-6 text-sm font-semibold text-gray-700">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((invoice, idx) => (
                    <tr
                      key={invoice.id}
                      className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
                    >
                      <td className="py-4 px-6">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
                            invoice.type === 'income'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {invoice.type === 'income' ? '↓ Ingreso' : '↑ Gasto'}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <div className="font-semibold text-black text-sm">{invoice.company}</div>
                        <div className="text-xs text-gray-500">{invoice.number}</div>
                      </td>
                      <td className="py-4 px-6">
                        <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
                          {invoice.category}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-medium">
                          {invoice.method}
                        </span>
                      </td>
                      <td className={`py-4 px-6 text-right font-bold text-sm ${
                        invoice.type === 'income' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {invoice.type === 'income' ? '+' : '-'}{invoice.amount.toFixed(2)}€
                      </td>
                      <td className="py-4 px-6 text-gray-600 text-sm">{invoice.date}</td>
                      <td className="py-4 px-6 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => startEditInvoice(invoice)}
                            className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-2 rounded-lg transition-all"
                            title="Editar"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => deleteInvoice(invoice.id)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-all"
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
                <p className="text-gray-600 text-lg font-semibold mb-2">No hay registros que coincidan</p>
                <p className="text-gray-500 text-sm">Intenta cambiar los filtros o importa un CSV</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Income Dialog */}
      {showIncomeDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-black">Registrar Ingreso</h2>
              <button
                onClick={() => setShowIncomeDialog(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Número de factura</label>
                <input
                  type="text"
                  value={formData.number}
                  onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                  placeholder="Número de factura"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Empresa/Cliente</label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="Empresa/Cliente"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Método de Pago</label>
                <select
                  value={formData.method}
                  onChange={(e) => setFormData({ ...formData, method: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                >
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Fecha</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Monto (Con IVA)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="Monto (Con IVA)"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Monto (Sin IVA)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amountWithoutVAT}
                  onChange={(e) => setFormData({ ...formData, amountWithoutVAT: e.target.value })}
                  placeholder="Monto (Sin IVA)"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Archivo PDF</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                />
              </div>
              {selectedFile && <p className="text-sm text-green-600">✓ {selectedFile.name}</p>}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowIncomeDialog(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-gray-700 font-semibold hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleAddInvoice('income')}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expense Dialog */}
      {showExpenseDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-black">Registrar Gasto</h2>
              <button
                onClick={() => setShowExpenseDialog(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Número de factura</label>
                <input
                  type="text"
                  value={formData.number}
                  onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                  placeholder="Número de factura"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Proveedor/Empresa</label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="Proveedor/Empresa"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Categoría</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Método de Pago</label>
                <select
                  value={formData.method}
                  onChange={(e) => setFormData({ ...formData, method: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                >
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Fecha</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Monto (Con IVA)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="Monto (Con IVA)"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Monto (Sin IVA)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amountWithoutVAT}
                  onChange={(e) => setFormData({ ...formData, amountWithoutVAT: e.target.value })}
                  placeholder="Monto (Sin IVA)"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Archivo PDF</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                />
              </div>
              {selectedFile && <p className="text-sm text-green-600">✓ {selectedFile.name}</p>}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowExpenseDialog(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-gray-700 font-semibold hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleAddInvoice('expense')}
                  className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg font-semibold hover:bg-slate-800"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      {showEditDialog && editingId && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-black">Editar Registro</h2>
              <button
                onClick={() => {
                  setShowEditDialog(false);
                  setEditingId(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Número de factura</label>
                <input
                  type="text"
                  value={formData.number}
                  onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Empresa/Proveedor</label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Categoría</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Método de Pago</label>
                <select
                  value={formData.method}
                  onChange={(e) => setFormData({ ...formData, method: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                >
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Fecha</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Monto (Con IVA)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Monto (Sin IVA)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amountWithoutVAT}
                  onChange={(e) => setFormData({ ...formData, amountWithoutVAT: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowEditDialog(false);
                    setEditingId(null);
                  }}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-gray-700 font-semibold hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveEditInvoice}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
                >
                  Guardar Cambios
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Dialog */}
      {showImportDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-black">Importar CSV</h2>
              <button
                onClick={() => {
                  setShowImportDialog(false);
                  setImportMessage('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-gray-600 text-sm">
                Selecciona tu archivo CSV de Google Sheets para importar tus facturas automáticamente.
              </p>
              <div className="border-2 border-dashed border-blue-300 rounded-lg p-6 text-center bg-blue-50">
                <FileUp size={32} className="mx-auto text-blue-600 mb-2" />
                <label className="cursor-pointer">
                  <span className="text-blue-600 font-bold text-sm block">Selecciona un archivo CSV</span>
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
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-xs text-blue-700">
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
    </div>
  );
}
