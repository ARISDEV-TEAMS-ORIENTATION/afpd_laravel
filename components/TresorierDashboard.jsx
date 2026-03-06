import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Bell,
  Plus,
  Filter,
  FileText,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  AlertTriangle,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiDownload, apiFetch, apiGet, apiPost, clearAuthToken } from '../src/api';
import AFPDLogo from './AFPDLogo';
import ProfileModal from './ProfileModal';
import ProfileAvatarBadge from './ProfileAvatarBadge';

const CotisationsTracker = () => {
  const [activeTab, setActiveTab] = useState('tous');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 4;
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState('date_desc');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false);
  const [payments, setPayments] = useState([]);
  const [isLoadingPayments, setIsLoadingPayments] = useState(true);
  const [paymentsError, setPaymentsError] = useState('');
  const [users, setUsers] = useState([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [paymentForm, setPaymentForm] = useState({ user_id: '', montant: '' });
  const [summaryData, setSummaryData] = useState(null);
  const [latePayments, setLatePayments] = useState([]);
  const [isLoadingInsights, setIsLoadingInsights] = useState(true);
  const [insightsError, setInsightsError] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [isGeneratingReceiptId, setIsGeneratingReceiptId] = useState(null);
  const [receiptError, setReceiptError] = useState('');
  const hasFetchedRef = useRef(false);
  const navigate = useNavigate();

  const currentMonth = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    return `${year}-${month}`;
  }, []);

  const getInitials = (lastName, firstName) => {
    const first = (lastName || '').trim().charAt(0);
    const second = (firstName || '').trim().charAt(0);
    return `${first}${second}`.toUpperCase() || '--';
  };

  const normalizeText = (value) => (
    String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
  );

  const parseAmount = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    const raw = String(value).trim();
    if (!raw) return null;

    const cleaned = raw
      .replace(/\s+/g, '')
      .replace(/[^\d,.-]/g, '');
    if (!cleaned) return null;

    let normalized = cleaned;
    const hasComma = normalized.includes(',');
    const hasDot = normalized.includes('.');

    if (hasComma && hasDot) {
      const lastComma = normalized.lastIndexOf(',');
      const lastDot = normalized.lastIndexOf('.');
      normalized = lastComma > lastDot
        ? normalized.replace(/\./g, '').replace(',', '.')
        : normalized.replace(/,/g, '');
    } else if (hasComma) {
      normalized = normalized.replace(',', '.');
    }

    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const parseDateMs = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) {
      const ms = value.getTime();
      return Number.isNaN(ms) ? null : ms;
    }
    if (typeof value === 'number') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date.getTime();
    }
    if (typeof value !== 'string') return null;

    const raw = value.trim();
    if (!raw) return null;

    const isoMonthMatch = raw.match(/^(\d{4})-(\d{2})$/);
    if (isoMonthMatch) {
      const year = Number(isoMonthMatch[1]);
      const month = Number(isoMonthMatch[2]);
      if (month >= 1 && month <= 12) {
        return new Date(year, month - 1, 1).getTime();
      }
    }

    const frDateMatch = raw.match(
      /^(\d{2})[/-](\d{2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
    );
    if (frDateMatch) {
      const day = Number(frDateMatch[1]);
      const month = Number(frDateMatch[2]);
      const year = Number(frDateMatch[3]);
      const hour = Number(frDateMatch[4] ?? 0);
      const minute = Number(frDateMatch[5] ?? 0);
      const second = Number(frDateMatch[6] ?? 0);
      const date = new Date(year, month - 1, day, hour, minute, second);
      return Number.isNaN(date.getTime()) ? null : date.getTime();
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
  };

  const getMonthKeyFromDateMs = (dateMs) => {
    if (dateMs === null) return '';
    const date = new Date(dateMs);
    if (Number.isNaN(date.getTime())) return '';
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    return `${date.getFullYear()}-${month}`;
  };

  const parseMonthKey = (value) => {
    if (!value) return '';
    const raw = String(value).trim();
    if (!raw) return '';

    const yyyyMm = raw.match(/^(\d{4})[-/](\d{2})$/);
    if (yyyyMm) {
      const month = Number(yyyyMm[2]);
      if (month >= 1 && month <= 12) return `${yyyyMm[1]}-${yyyyMm[2]}`;
    }

    const mmYyyy = raw.match(/^(\d{2})[-/](\d{4})$/);
    if (mmYyyy) {
      const month = Number(mmYyyy[1]);
      if (month >= 1 && month <= 12) return `${mmYyyy[2]}-${mmYyyy[1]}`;
    }

    return '';
  };

  const normalizePaymentStatus = (value) => {
    const normalized = normalizeText(value);
    if (!normalized) return '';
    if (
      normalized.includes('paye')
      || normalized.includes('paid')
      || normalized.includes('regle')
      || normalized.includes('reglee')
      || normalized.includes('valide')
    ) {
      return 'paid';
    }
    if (
      normalized.includes('retard')
      || normalized.includes('late')
      || normalized.includes('overdue')
    ) {
      return 'late';
    }
    if (
      normalized.includes('attente')
      || normalized.includes('pending')
      || normalized.includes('impaye')
      || normalized.includes('unpaid')
      || normalized.includes('partiel')
    ) {
      return 'pending';
    }
    return '';
  };

  const formatAmount = (value) => {
    if (value === null || value === undefined || value === '') return '-';
    const numberValue = Number(value);
    if (Number.isNaN(numberValue)) return `${value}`;
    return `${numberValue.toFixed(2)} F CFA`;
  };

  const formatDate = (value) => {
    if (!value) return '-';
    const parsedMs = parseDateMs(value);
    if (parsedMs === null) return `${value}`;
    const parsed = new Date(parsedMs);
    return parsed.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatTime = (value) => {
    if (!value) return '-';
    if (typeof value === 'string' && /^\d{1,2}:\d{2}/.test(value.trim())) {
      return value.trim();
    }
    const parsedMs = parseDateMs(value);
    if (parsedMs === null) return `${value}`;
    const parsed = new Date(parsedMs);
    return parsed.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  const getDateMs = (value) => parseDateMs(value);

  const getPaymentDateValue = (payment) => (
    payment?.date ??
    payment?.date_paiement ??
    payment?.payment_date ??
    payment?.created_at ??
    payment?.createdAt ??
    payment?.paid_at ??
    payment?.timestamp
  );

  const getPaymentTimeValue = (payment, fallbackDateValue) => (
    payment?.heure ??
    payment?.time ??
    payment?.heure_paiement ??
    payment?.payment_time_local ??
    payment?.payment_time ??
    fallbackDateValue
  );

  const getPaymentAmountValue = (payment) => (
    parseAmount(
      payment?.montant ??
      payment?.amount ??
      payment?.montant_cotisation ??
      payment?.montant_total ??
      payment?.total_amount,
    )
  );

  const getPaymentMonthKey = (payment) => {
    const periodCandidates = [
      payment?.periode,
      payment?.period,
      payment?.mois,
      payment?.month,
      payment?.month_key,
    ];
    for (const candidate of periodCandidates) {
      const parsed = parseMonthKey(candidate);
      if (parsed) return parsed;
    }

    const dateMs = getDateMs(getPaymentDateValue(payment));
    return getMonthKeyFromDateMs(dateMs);
  };

  const toList = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.data?.data)) return payload.data.data;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.results)) return payload.results;
    if (Array.isArray(payload?.rows)) return payload.rows;
    return [];
  };

  const toItem = (payload) => {
    if (!payload || typeof payload !== 'object') return null;
    if (Array.isArray(payload)) return null;
    if (payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
      return payload.data;
    }
    return payload;
  };

  const readSummaryAmount = (summaryPayload) => {
    const summary = toItem(summaryPayload) || {};
    const candidates = [
      summary.total_amount,
      summary.total_collected,
      summary.total_paye,
      summary.total_paid,
      summary.montant_total,
      summary.total,
    ];
    for (const value of candidates) {
      const parsed = parseAmount(value);
      if (parsed !== null) return parsed;
    }
    return null;
  };

  const readSummaryLateCount = (summaryPayload) => {
    const summary = toItem(summaryPayload) || {};
    const candidates = [
      summary.late_count,
      summary.retard_count,
      summary.overdue_count,
      summary.pending_count,
      summary.en_attente_count,
    ];
    for (const value of candidates) {
      const parsed = Number(value);
      if (!Number.isNaN(parsed) && parsed >= 0) return parsed;
    }
    return null;
  };

  const buildCotisationsQuery = () => {
    const params = new URLSearchParams();
    const statusByTab = {
      payes: 'paye',
      attente: 'en_attente',
      retard: 'retard',
    };
    const mappedStatus = statusByTab[activeTab];
    if (mappedStatus) params.set('status', mappedStatus);
    params.set('month', currentMonth);
    return params.toString();
  };

  const fetchPayments = async () => {
    setIsLoadingPayments(true);
    setPaymentsError('');
    try {
      const data = await apiGet('/api/cotisations');
      const list = toList(data);
      if (!Array.isArray(list)) {
        throw new Error('Format de réponse invalide pour les paiements.');
      }
      setPayments(list);
    } catch (error) {
      setPaymentsError(error?.message || "Impossible de charger les paiements.");
    } finally {
      setIsLoadingPayments(false);
    }
  };

  const fetchUsers = async () => {
    setIsLoadingUsers(true);
    setUsersError('');
    try {
      const data = await apiGet('/api/users');
      const list = toList(data);
      if (!Array.isArray(list)) {
        throw new Error('Format de réponse invalide pour les utilisateurs.');
      }
      const eligibleUsers = Array.isArray(list)
        ? list.filter((user) => (user?.statut ?? '').toLowerCase() !== 'pending')
        : [];
      setUsers(eligibleUsers);
    } catch (error) {
      setUsersError(error?.message || "Impossible de charger les utilisateurs.");
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const fetchInsights = async () => {
    setIsLoadingInsights(true);
    setInsightsError('');
    try {
      const [summaryResponse, lateResponse] = await Promise.all([
        apiGet('/api/cotisations/summary'),
        apiGet('/api/cotisations/late'),
      ]);
      setSummaryData(toItem(summaryResponse));
      setLatePayments(toList(lateResponse));
    } catch (error) {
      setSummaryData(null);
      setLatePayments([]);
      setInsightsError(error?.message || "Impossible de charger les indicateurs de cotisations.");
    } finally {
      setIsLoadingInsights(false);
    }
  };

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    fetchPayments();
    fetchUsers();
    fetchInsights();
  }, []);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await apiFetch('/api/logout', { method: 'POST', credentials: 'include' });
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
    } finally {
      clearAuthToken();
      setIsLoggingOut(false);
      navigate('/');
    }
  };

  const handlePaymentFieldChange = (field, value) => {
    setPaymentForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddPayment = async (e) => {
    e.preventDefault();
    if (isSubmittingPayment) return;
    setIsSubmittingPayment(true);
    setPaymentError('');
    try {
      const payload = {
        user_id: Number(paymentForm.user_id),
        montant: Number(paymentForm.montant),
      };
      await apiPost('/api/cotisations', payload);
      setIsAddPaymentOpen(false);
      setPaymentForm({ user_id: '', montant: '' });
      await Promise.all([fetchPayments(), fetchInsights()]);
    } catch (error) {
      setPaymentError(error?.message || "Impossible d'enregistrer le paiement.");
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const triggerBlobDownload = (blob, filename) => {
    const blobUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(blobUrl);
  };

  const readFilenameFromContentDisposition = (contentDispositionValue) => {
    if (!contentDispositionValue || typeof contentDispositionValue !== 'string') return '';
    const utf8Match = contentDispositionValue.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      try {
        return decodeURIComponent(utf8Match[1].replace(/["']/g, '').trim());
      } catch {
        return utf8Match[1].replace(/["']/g, '').trim();
      }
    }
    const asciiMatch = contentDispositionValue.match(/filename="?([^";]+)"?/i);
    return asciiMatch?.[1]?.trim() || '';
  };

  const handleExport = async (format) => {
    if (isExporting) return;
    setIsExporting(true);
    setExportError('');
    try {
      const query = buildCotisationsQuery();
      const endpoint = `/api/cotisations/export/${format}${query ? `?${query}` : ''}`;
      const blob = await apiDownload(endpoint);
      const filename = `cotisations-${currentMonth}.${format}`;
      triggerBlobDownload(blob, filename);
    } catch (error) {
      setExportError(error?.message || "L'export a échoué.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleGenerateReceipt = async (paymentId) => {
    if (!paymentId || isGeneratingReceiptId) return;
    setIsGeneratingReceiptId(paymentId);
    setReceiptError('');
    try {
      const response = await apiFetch(`/api/cotisations/${paymentId}/receipt`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const contentType = (response.headers.get('content-type') || '').toLowerCase();

      if (contentType.includes('application/json')) {
        const payload = await response.json();
        const receiptUrl = payload?.url ?? payload?.download_url ?? payload?.receipt_url ?? '';
        if (receiptUrl && typeof receiptUrl === 'string') {
          window.open(receiptUrl, '_blank', 'noopener,noreferrer');
          return;
        }
        throw new Error('Le serveur n’a pas retourné de lien de reçu exploitable.');
      }

      const blob = await response.blob();
      const filenameFromHeaders = readFilenameFromContentDisposition(
        response.headers.get('content-disposition'),
      );
      const isPdfLike = contentType.includes('application/pdf') || /\.pdf$/i.test(filenameFromHeaders);
      if (isPdfLike) {
        const fallbackFilename = `recu-cotisation-${paymentId}.pdf`;
        triggerBlobDownload(blob, filenameFromHeaders || fallbackFilename);
        return;
      }

      if (contentType.includes('text/html')) {
        const htmlUrl = window.URL.createObjectURL(blob);
        window.open(htmlUrl, '_blank', 'noopener,noreferrer');
        setTimeout(() => window.URL.revokeObjectURL(htmlUrl), 60_000);
        return;
      }

      if (contentType.includes('text/plain')) {
        const rawText = (await blob.text()).trim();
        if (/^https?:\/\//i.test(rawText)) {
          window.open(rawText, '_blank', 'noopener,noreferrer');
          return;
        }
      }

      throw new Error('Format de reçu non pris en charge par le navigateur.');
    } catch (error) {
      setReceiptError(error?.message || 'Impossible de générer le reçu.');
    } finally {
      setIsGeneratingReceiptId(null);
    }
  };

  const usersById = useMemo(() => {
    const map = new Map();
    users.forEach((user) => {
      if (user?.id === null || user?.id === undefined) return;
      map.set(`${user.id}`, user);
    });
    return map;
  }, [users]);

  const paymentEntries = useMemo(() => {
    return payments
      .map((payment, index) => {
        const userId = payment?.user_id ?? payment?.membre_id ?? payment?.member_id ?? payment?.adherente_id;
        if (userId === null || userId === undefined || userId === '') return null;

        const userKey = `${userId}`;
        const linkedUser = usersById.get(userKey);
        const amountValue = getPaymentAmountValue(payment);
        const dateValue = getPaymentDateValue(payment);
        const dateMs = getDateMs(dateValue);
        const timeValue = getPaymentTimeValue(payment, dateValue);
        const fullName = `${payment?.nom ?? linkedUser?.nom ?? ''} ${payment?.prenom ?? linkedUser?.prenom ?? ''}`.trim();
        const rawStatus = normalizePaymentStatus(
          payment?.statut ?? payment?.status ?? payment?.etat ?? payment?.state,
        );

        return {
          id: payment?.id ?? `${userKey}-${dateValue ?? index}`,
          paymentId: payment?.id ?? null,
          userId: userKey,
          memberId: userKey,
          name: fullName || '-',
          initials: getInitials(payment?.nom ?? linkedUser?.nom, payment?.prenom ?? linkedUser?.prenom),
          dateMs,
          date: formatDate(dateValue),
          time: formatTime(timeValue),
          amountValue,
          amount: formatAmount(amountValue),
          period: payment?.periode ?? payment?.period ?? '-',
          monthKey: getPaymentMonthKey(payment),
          status: rawStatus || (amountValue !== null && amountValue > 0 ? 'paid' : ''),
        };
      })
      .filter(Boolean);
  }, [payments, usersById]);

  const latestPaymentByUserId = useMemo(() => {
    const map = new Map();
    paymentEntries.forEach((entry) => {
      const current = map.get(entry.userId);
      if (!current) {
        map.set(entry.userId, entry);
        return;
      }
      if (current.dateMs === null && entry.dateMs !== null) {
        map.set(entry.userId, entry);
        return;
      }
      if (current.dateMs !== null && entry.dateMs !== null && entry.dateMs > current.dateMs) {
        map.set(entry.userId, entry);
      }
    });
    return map;
  }, [paymentEntries]);

  const currentMonthPaymentByUserId = useMemo(() => {
    const map = new Map();
    paymentEntries.forEach((entry) => {
      if (!entry.monthKey || entry.monthKey !== currentMonth) return;
      const current = map.get(entry.userId);
      if (!current) {
        map.set(entry.userId, entry);
        return;
      }
      if (current.dateMs === null && entry.dateMs !== null) {
        map.set(entry.userId, entry);
        return;
      }
      if (current.dateMs !== null && entry.dateMs !== null && entry.dateMs > current.dateMs) {
        map.set(entry.userId, entry);
      }
    });
    return map;
  }, [currentMonth, paymentEntries]);

  const archivedPaymentsDisplay = useMemo(() => {
    return paymentEntries
      .filter((entry) => {
        if (entry.amountValue === null || entry.amountValue <= 0) return false;
        if (!entry.monthKey) return true;
        return entry.monthKey !== currentMonth;
      })
      .sort((a, b) => {
        if (a.dateMs === null && b.dateMs === null) return 0;
        if (a.dateMs === null) return 1;
        if (b.dateMs === null) return -1;
        return b.dateMs - a.dateMs;
      });
  }, [currentMonth, paymentEntries]);

  const archivedPaymentsFiltered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return archivedPaymentsDisplay;
    return archivedPaymentsDisplay.filter((payment) => {
      const name = payment.name?.toLowerCase() ?? '';
      const memberId = String(payment.memberId ?? '').toLowerCase();
      return name.includes(query) || memberId.includes(query);
    });
  }, [archivedPaymentsDisplay, searchQuery]);

  const paymentsDisplay = useMemo(() => {
    return users.map((user) => {
      const userId = user?.id;
      const userKey = userId === null || userId === undefined ? '' : `${userId}`;
      const currentMonthPayment = userKey ? (currentMonthPaymentByUserId.get(userKey) ?? null) : null;
      const latestPayment = userKey ? (latestPaymentByUserId.get(userKey) ?? null) : null;

      const registrationDateValue =
        user?.created_at ??
        user?.createdAt ??
        user?.date_inscription ??
        user?.date;
      const registrationDateMs = getDateMs(registrationDateValue);
      const registrationMonthKey = getMonthKeyFromDateMs(registrationDateMs);
      const hasCurrentPaymentRecord = Boolean(currentMonthPayment);

      const computedStatus = (() => {
        if (hasCurrentPaymentRecord) {
          if (currentMonthPayment.status) return currentMonthPayment.status;
          if (currentMonthPayment.amountValue !== null && currentMonthPayment.amountValue > 0) {
            return 'paid';
          }
          return 'pending';
        }
        if (registrationMonthKey && registrationMonthKey < currentMonth) return 'late';
        return 'pending';
      })();

      const referenceDateMs =
        currentMonthPayment?.dateMs ?? latestPayment?.dateMs ?? registrationDateMs;

      const fullName = `${user?.nom ?? ''} ${user?.prenom ?? ''}`.trim();

      return {
        id: userId ?? `member-${fullName || 'unknown'}`,
        initials: getInitials(user?.nom, user?.prenom),
        name: fullName || '-',
        sortName: (fullName || '').toLowerCase(),
        memberId: userKey || '-',
        date: hasCurrentPaymentRecord ? currentMonthPayment.date : '-',
        sortDateMs: referenceDateMs,
        time: hasCurrentPaymentRecord ? currentMonthPayment.time : '-',
        period: hasCurrentPaymentRecord ? (currentMonthPayment.period || currentMonth) : '-',
        amount: hasCurrentPaymentRecord ? currentMonthPayment.amount : '-',
        amountValue: hasCurrentPaymentRecord ? currentMonthPayment.amountValue : null,
        hasArchivedPayment: !hasCurrentPaymentRecord && !!latestPayment,
        lastPaymentDate: latestPayment?.date ?? '-',
        lastPaymentTime: latestPayment?.time ?? '-',
        receiptPaymentId: computedStatus === 'paid' ? (currentMonthPayment?.paymentId ?? null) : null,
        status: computedStatus,
        rawStatus: computedStatus,
        color: '#F8D7EA',
      };
    });
  }, [users, currentMonthPaymentByUserId, latestPaymentByUserId, currentMonth]);

  const filteredPaymentsDisplay = useMemo(() => {
    if (activeTab === 'payes') {
      return paymentsDisplay.filter((payment) => payment.status === 'paid');
    }
    if (activeTab === 'attente') {
      return paymentsDisplay.filter((payment) => payment.status === 'pending');
    }
    if (activeTab === 'retard') {
      return paymentsDisplay.filter((payment) => payment.status === 'late');
    }
    return paymentsDisplay;
  }, [activeTab, paymentsDisplay]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, paymentsDisplay.length, searchQuery, sortOption]);

  const searchedPaymentsDisplay = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return filteredPaymentsDisplay;
    return filteredPaymentsDisplay.filter((payment) => {
      const name = payment.name?.toLowerCase() ?? '';
      const memberId = String(payment.memberId ?? '').toLowerCase();
      return name.includes(query) || memberId.includes(query);
    });
  }, [filteredPaymentsDisplay, searchQuery]);

  const sortedPaymentsDisplay = useMemo(() => {
    const list = [...searchedPaymentsDisplay];
    if (sortOption === 'date_asc') {
      list.sort((a, b) => {
        const aDate = a.sortDateMs;
        const bDate = b.sortDateMs;
        if (aDate === null && bDate === null) return 0;
        if (aDate === null) return 1;
        if (bDate === null) return -1;
        return aDate - bDate;
      });
    }
    if (sortOption === 'date_desc') {
      list.sort((a, b) => {
        const aDate = a.sortDateMs;
        const bDate = b.sortDateMs;
        if (aDate === null && bDate === null) return 0;
        if (aDate === null) return 1;
        if (bDate === null) return -1;
        return bDate - aDate;
      });
    }
    if (sortOption === 'name_asc') {
      list.sort((a, b) => a.sortName.localeCompare(b.sortName, 'fr', { sensitivity: 'base' }));
    }
    if (sortOption === 'name_desc') {
      list.sort((a, b) => b.sortName.localeCompare(a.sortName, 'fr', { sensitivity: 'base' }));
    }
    return list;
  }, [searchedPaymentsDisplay, sortOption]);

  const totalPages = Math.max(1, Math.ceil(sortedPaymentsDisplay.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedPaymentsDisplay = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * itemsPerPage;
    return sortedPaymentsDisplay.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedPaymentsDisplay, safeCurrentPage]);

  const stats = useMemo(() => {
    const currentYear = new Date().getFullYear();
    let totalCollected = 0;
    let latestPaymentMs = null;

    paymentEntries.forEach((entry) => {
      if (entry.amountValue !== null && entry.amountValue > 0) {
        const amount = entry.amountValue;
        const dateMs = entry.dateMs;
        const yearMatch = dateMs ? new Date(dateMs).getFullYear() === currentYear : true;
        if (yearMatch) totalCollected += amount;
      }
      if (entry.dateMs) {
        latestPaymentMs = latestPaymentMs === null ? entry.dateMs : Math.max(latestPaymentMs, entry.dateMs);
      }
    });

    const lateOrPendingCount = paymentsDisplay.filter(
      (payment) => payment.status === 'late' || payment.status === 'pending',
    ).length;

    const summaryAmount = readSummaryAmount(summaryData);
    const summaryLateCount = readSummaryLateCount(summaryData);
    const lateFromEndpoint = Array.isArray(latePayments) ? latePayments.length : null;
    const effectiveCollected = summaryAmount === null
      ? totalCollected
      : Math.max(summaryAmount, totalCollected);
    const lateCandidates = [summaryLateCount, lateFromEndpoint, lateOrPendingCount]
      .filter((value) => Number.isFinite(value) && value >= 0);
    const effectiveLateCount = lateCandidates.length ? Math.max(...lateCandidates) : 0;

    const lastUpdateLabel = latestPaymentMs
      ? `Dernière mise à jour: ${formatDate(latestPaymentMs)} ${formatTime(latestPaymentMs)}`
      : 'Dernière mise à jour: -';

    return [
      {
        title: "TOTAL COLLECTÉ (ANNUEL)",
        amount: formatAmount(effectiveCollected),
        change: '',
        subtitle: lastUpdateLabel,
        icon: CircleDollarSign,
        color: "brand"
      },
      {
        title: "IMPAYÉS / RETARD",
        amount: `${effectiveLateCount}`,
        change: '',
        subtitle: `${effectiveLateCount} adhérente(s) en attente ou en retard`,
        icon: AlertTriangle,
        color: "orange"
      },
      {
        title: "ADHÉRENTES SUIVIES",
        amount: `${users.length}`,
        change: '',
        subtitle: "Adhérentes suivies",
        icon: Users,
        color: "rose"
      }
    ];
  }, [latePayments, paymentEntries, paymentsDisplay, summaryData, users]);

  const getStatusBadge = (status) => {
    switch(status) {
      case true:
      case 'paid':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium" 
                style={{ backgroundColor: '#D1FAE5', color: '#065F46' }}>
            <span className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: '#059669' }}></span>
            Payé
          </span>
        );
      case 'late':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
                style={{ backgroundColor: '#FEE2E2', color: '#991B1B' }}>
            <span className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: '#DC2626' }}></span>
            En retard
          </span>
        );
      case false:
      case 'pending':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
                style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>
            <span className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: '#F59E0B' }}></span>
            En attente
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
                style={{ backgroundColor: '#E5E7EB', color: '#374151' }}>
            Inconnu
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FDF5FA' }}>
      {/* Header */}
      <header className="bg-white border-b border-fuchsia-100 px-8 py- sticky top-0 z-30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
          <AFPDLogo compact showSubtitle={false} />
          <h1 className="text-2xl font-semibold text-gray-900">Tableau Trésorière</h1>
          </div>
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl bg-fuchsia-50/60 text-sm text-gray-700 justify-start`}>
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70 animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className={`block`}>Connectée</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Rechercher une membre ou une transaction..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-96 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:border-transparent"
                style={{ fontSize: '14px' }}
              />
            </div>
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <Bell size={20} className="text-gray-600" />
            </button>
            <button
              type="button"
              onClick={() => setIsProfileOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-fuchsia-700 hover:bg-fuchsia-50 transition"
            >
              Mon profil
            </button>
            <ProfileAvatarBadge onClick={() => setIsProfileOpen(true)} />
            <button
              type="button"
              onClick={() => setIsAddPaymentOpen(true)}
              className="flex items-center gap-2 px-2 py- rounded-lg text-white font-medium hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: '#B8328F' }}>
              <Plus size={20} />
              Enregistrer un paiement
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-8 py-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          {stats.map((stat, index) => (
            <div key={index} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-start justify-between mb-4">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  {stat.title}
                </span>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center signal-icon"
                     style={{ 
                       backgroundColor: stat.color === 'brand' ? '#FCE7F3' : 
                                       stat.color === 'orange' ? '#FFF1F2' : '#FDF2F8'
                     }}>
                  <stat.icon
                    className={`w-5 h-5 ${
                      stat.color === 'brand'
                        ? 'text-fuchsia-700'
                        : stat.color === 'orange'
                        ? 'text-rose-700'
                        : 'text-pink-700'
                    }`}
                  />
                </div>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-3xl font-bold text-gray-900 mb-1">
                    {stat.amount}
                  </div>
                  <div className="text-sm text-gray-500">
                    {stat.subtitle}
                  </div>
                </div>
                {stat.change ? (
                  <div className={`text-sm font-semibold ${
                    stat.change.startsWith('+') ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {stat.change}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        {isLoadingInsights && (
          <div className="mb-4 rounded-xl border border-fuchsia-100 bg-fuchsia-50 px-4 py-3 text-sm text-fuchsia-700">
            Mise à jour des indicateurs (summary/late)...
          </div>
        )}

        {/* Table Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          {/* Tabs */}
          <div className="border-b border-gray-200 px-6">
            <div className="flex items-center justify-between">
              <div className="flex gap-8">
                {[
                  { key: 'tous', label: 'Toutes les adhérentes' },
                  { key: 'payes', label: 'Payés (mois en cours)' },
                  { key: 'attente', label: 'En attente' },
                  { key: 'retard', label: 'En retard' }
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`py-4 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab.key
                        ? 'border-fuchsia-600 text-fuchsia-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            <div className="flex items-center gap-3">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsSortMenuOpen((prev) => !prev)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <Filter size={16} />
                    Filtres
                  </button>
                  {isSortMenuOpen && (
                    <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-20">
                      {[
                        { value: 'date_desc', label: 'Date décroissante' },
                        { value: 'date_asc', label: 'Date croissante' },
                        { value: 'name_asc', label: 'Nom A → Z' },
                        { value: 'name_desc', label: 'Nom Z → A' }
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setSortOption(option.value);
                            setIsSortMenuOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                            sortOption === option.value
                              ? 'bg-fuchsia-50 text-fuchsia-700 font-semibold'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleExport('pdf')}
                  disabled={isExporting}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <FileText size={16} />
                  {isExporting ? 'Export...' : 'PDF'}
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('csv')}
                  disabled={isExporting}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <FileSpreadsheet size={16} />
                  {isExporting ? 'Export...' : 'Excel'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsArchiveOpen((prev) => !prev)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-fuchsia-700 bg-fuchsia-50 hover:bg-fuchsia-100 rounded-lg transition-colors"
                >
                  {isArchiveOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  {isArchiveOpen ? 'Masquer les archives' : `Archives (${archivedPaymentsDisplay.length})`}
                </button>
              </div>
            </div>
          </div>
          <div className="px-6 py-3 bg-rose-50 border-b border-rose-100">
            <p className="text-xs text-rose-700">
              Le statut “Payé” est calculé sur le mois en cours. Les paiements des mois précédents restent consultables dans les archives.
            </p>
          </div>
          {(insightsError || exportError || receiptError) && (
            <div className="px-6 py-3 border-b border-red-100 bg-red-50 text-sm text-red-700">
              {insightsError || exportError || receiptError}
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Membre
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Heure
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Montant
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Statut
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {(isLoadingPayments || isLoadingUsers) && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      Chargement des adhérentes...
                    </td>
                  </tr>
                )}
                {!isLoadingPayments && !isLoadingUsers && paymentsError && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-red-600">
                      {paymentsError}
                    </td>
                  </tr>
                )}
                {!isLoadingPayments && !isLoadingUsers && usersError && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-red-600">
                      {usersError}
                    </td>
                  </tr>
                )}
                {!isLoadingPayments && !isLoadingUsers && !paymentsError && !usersError && sortedPaymentsDisplay.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      Aucune adhérente trouvée.
                    </td>
                  </tr>
                )}
                {!isLoadingPayments && !isLoadingUsers && !paymentsError && !usersError && paginatedPaymentsDisplay.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold"
                          style={{ backgroundColor: payment.color, color: '#374151' }}
                        >
                          {payment.initials}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                            {payment.status === 'pending' && (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
                                style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}
                              >
                                En attente
                              </span>
                            )}
                            <span>{payment.name}</span>
                          </div>
                          <div className="text-xs text-gray-500">
                            ID: {payment.memberId}
                          </div>
                          {payment.hasArchivedPayment && (
                            <div className="text-xs text-fuchsia-700 mt-1">
                              Dernier paiement archivé: {payment.lastPaymentDate} {payment.lastPaymentTime}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {payment.date}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {payment.time}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                      {payment.amount}
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(payment.status)}
                    </td>
                    <td className="px-6 py-4">
                      {payment.receiptPaymentId ? (
                        <button
                          type="button"
                          onClick={() => handleGenerateReceipt(payment.receiptPaymentId)}
                          disabled={isGeneratingReceiptId === payment.receiptPaymentId}
                          className="px-3 py-1.5 text-xs font-semibold text-fuchsia-700 bg-fuchsia-50 hover:bg-fuchsia-100 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {isGeneratingReceiptId === payment.receiptPaymentId ? 'Reçu...' : 'Reçu'}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Affichage de {paginatedPaymentsDisplay.length} sur {sortedPaymentsDisplay.length} adhérentes
            </div>
            <div className="flex items-center gap-2">
              <button 
                className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
                disabled={safeCurrentPage === 1}
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              >
                Précédent
              </button>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-8 h-8 text-sm font-medium rounded-lg transition-colors ${
                    safeCurrentPage === page
                      ? 'bg-fuchsia-600 text-white'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
                disabled={safeCurrentPage === totalPages}
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              >
                Suivant
              </button>
            </div>
          </div>
        </div>

        {isArchiveOpen && (
          <div className="mt-6 bg-white rounded-xl shadow-sm border border-fuchsia-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-fuchsia-100 bg-fuchsia-50/40">
              <h3 className="text-base font-semibold text-fuchsia-800">Archive des paiements</h3>
              <p className="text-xs text-fuchsia-700 mt-1">
                Les paiements des mois précédents sont conservés ici.
              </p>
            </div>
            <div className="overflow-x-auto max-h-[360px]">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-fuchsia-100">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Membre
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Heure
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Montant
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Période
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-fuchsia-100/70">
                  {archivedPaymentsFiltered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-6 text-center text-sm text-gray-500">
                        Aucun paiement archivé pour le moment.
                      </td>
                    </tr>
                  )}
                  {archivedPaymentsFiltered.map((payment) => (
                    <tr key={`archive-${payment.id}`} className="hover:bg-fuchsia-50/40 transition-colors">
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">
                        {payment.name} <span className="text-xs text-gray-500">(ID: {payment.memberId})</span>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-700">{payment.date}</td>
                      <td className="px-6 py-3 text-sm text-gray-700">{payment.time}</td>
                      <td className="px-6 py-3 text-sm font-semibold text-gray-900">{payment.amount}</td>
                      <td className="px-6 py-3 text-sm text-gray-700">{payment.period}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {isAddPaymentOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Fermer la fenêtre"
            onClick={() => setIsAddPaymentOpen(false)}
            className="absolute inset-0 z-0 bg-slate-900/50 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl shadow-2xl shadow-slate-900/20 ring-1 ring-black/10 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-900">Enregistrer un paiement</h3>
              <p className="text-sm text-slate-500 mt-1">
                Sélectionnez l'adhérente et saisissez le montant.
              </p>
            </div>
            <form onSubmit={handleAddPayment} className="px-6 py-5 space-y-4">
              <div>
                <label htmlFor="payment-user" className="block text-sm font-semibold text-slate-900 mb-2">
                  Utilisatrice
                </label>
                <select
                  id="payment-user"
                  value={paymentForm.user_id}
                  onChange={(e) => handlePaymentFieldChange('user_id', e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none transition-all text-base text-slate-900"
                  required
                >
                  <option value="">Sélectionner une utilisatrice</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {`${user?.nom ?? ''} ${user?.prenom ?? ''}`.trim()} {user?.email ? `- ${user.email}` : ''}
                    </option>
                  ))}
                </select>
                {usersError && (
                  <p className="text-xs text-red-600 mt-2">{usersError}</p>
                )}
              </div>
              <div>
                <label htmlFor="payment-amount" className="block text-sm font-semibold text-slate-900 mb-2">
                  Montant
                </label>
                <input
                  id="payment-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentForm.montant}
                  onChange={(e) => handlePaymentFieldChange('montant', e.target.value)}
                  placeholder="150.00"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50/60 focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500 outline-none transition-all text-base text-slate-900"
                  required
                />
              </div>
              {paymentError && (
                <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm font-medium border border-red-200">
                  {paymentError}
                </div>
              )}
              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddPaymentOpen(false)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:text-slate-900 hover:border-slate-300 transition-all duration-200 font-medium bg-gray-200 text-base"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayment}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-fuchsia-600 text-white font-semibold shadow-lg shadow-fuchsia-500/20 hover:bg-fuchsia-700 transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed text-base"
                >
                  {isSubmittingPayment ? 'Enregistrement...' : 'Valider'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        onLogout={handleLogout}
      />
    </div>
  );
};

export default CotisationsTracker;
