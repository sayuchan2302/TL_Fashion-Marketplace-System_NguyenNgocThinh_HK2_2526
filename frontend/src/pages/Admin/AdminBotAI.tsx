import './Admin.css';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  GitBranch,
  MessageSquare,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Send,
  Trash2,
  UploadCloud,
  type LucideIcon,
} from 'lucide-react';
import AdminLayout from './AdminLayout';
import AdminConfirmDialog from './AdminConfirmDialog';
import { useAdminToast } from './useAdminToast';
import { PanelFilterSelect } from '../../components/Panel/PanelPrimitives';
import {
  adminBotScenarioService,
  type BotScenarioActionKey,
  type BotScenarioPayload,
  type BotScenarioQuickAction,
  type BotScenarioSnapshot,
} from '../../services/adminBotScenarioService';
import { contentService, type ContentPage } from '../../services/contentService';

type FaqFormState = {
  id?: string;
  title: string;
  body: string;
  keywordsText: string;
};

type BotAdminTab = 'flows' | 'test' | 'faq';
type PromptFieldKey = Exclude<keyof BotScenarioPayload, 'quickActions'>;
type DraftSimulatorStep = 'menu' | 'awaitOrderCode' | 'awaitOrderPhone' | 'awaitHeight' | 'awaitWeight' | 'faqQuestion';

type DraftSimulatorMessage = {
  id: string;
  role: 'bot' | 'user';
  text: string;
  actions?: BotScenarioQuickAction[];
};

type PromptField = {
  key: PromptFieldKey;
  label: string;
  helper: string;
  rows?: number;
};

type ConversationFlow = {
  id: string;
  title: string;
  description: string;
  actionKey: BotScenarioActionKey;
  icon: LucideIcon;
  fields: PromptField[];
};

const QUICK_ACTION_ORDER: BotScenarioActionKey[] = ['ORDER_LOOKUP', 'SIZE_ADVICE', 'PRODUCT_FAQ'];
const DEFAULT_EXTRA_QUICK_ACTION: BotScenarioActionKey = 'PRODUCT_FAQ';

const QUICK_ACTION_LABEL: Record<BotScenarioActionKey, string> = {
  ORDER_LOOKUP: 'Tra cứu đơn hàng',
  SIZE_ADVICE: 'Tư vấn size',
  PRODUCT_FAQ: 'Hỏi đáp sản phẩm',
};

const BOT_ADMIN_TABS: Array<{ id: BotAdminTab; label: string; icon?: LucideIcon }> = [
  { id: 'faq', label: 'FAQ / Knowledge' },
  { id: 'flows', label: 'Luồng hội thoại', icon: GitBranch },
  { id: 'test', label: 'Test Draft' },
];

const FLOW_GROUPS: ConversationFlow[] = [
  {
    id: 'order',
    title: 'Tra cứu đơn hàng',
    description: 'Luồng hỏi mã đơn, xác thực 4 số cuối số điện thoại và trả trạng thái đơn.',
    actionKey: 'ORDER_LOOKUP',
    icon: ClipboardCheck,
    fields: [
      { key: 'askOrderCodePrompt', label: 'Hỏi mã đơn', helper: 'Bot gửi sau khi khách chọn tra cứu đơn hàng.' },
      { key: 'askOrderPhonePrompt', label: 'Hỏi 4 số cuối SĐT', helper: 'Dùng để xác thực đơn trước khi trả kết quả.' },
      { key: 'orderPhoneInvalidPrompt', label: 'Thông báo sai SĐT', helper: 'Hiển thị khi khách nhập không đủ 4 chữ số.' },
      { key: 'orderLookupContinuePrompt', label: 'Hỏi tiếp sau tra cứu', helper: 'Bot đưa khách quay lại menu chính.' },
    ],
  },
  {
    id: 'size',
    title: 'Tư vấn size',
    description: 'Luồng hỏi chiều cao, cân nặng và gợi ý size theo logic hiện tại của backend.',
    actionKey: 'SIZE_ADVICE',
    icon: Bot,
    fields: [
      { key: 'askHeightPrompt', label: 'Hỏi chiều cao', helper: 'Chiều cao hợp lệ trong runtime: 120-230cm.' },
      { key: 'invalidHeightPrompt', label: 'Chiều cao không hợp lệ', helper: 'Hiển thị khi khách nhập ngoài khoảng hoặc không phải số.' },
      { key: 'askWeightPrompt', label: 'Hỏi cân nặng', helper: 'Cân nặng hợp lệ trong runtime: 30-200kg.' },
      { key: 'invalidWeightPrompt', label: 'Cân nặng không hợp lệ', helper: 'Hiển thị khi khách nhập ngoài khoảng hoặc không phải số.' },
      { key: 'sizeAdviceContinuePrompt', label: 'Hỏi tiếp sau tư vấn', helper: 'Bot đưa khách quay lại menu chính.' },
    ],
  },
  {
    id: 'productFaq',
    title: 'Hỏi đáp sản phẩm',
    description: 'Luồng trả lời theo FAQ/keyword và sau đó mời khách chọn tiếp menu.',
    actionKey: 'PRODUCT_FAQ',
    icon: MessageSquare,
    fields: [
      { key: 'productFaqContinuePrompt', label: 'Hỏi tiếp sau FAQ', helper: 'Bot gửi sau khi trả lời FAQ hoặc fallback.' },
    ],
  },
];

const REQUIRED_PROMPT_FIELDS: Array<{ key: PromptFieldKey; label: string }> = [
  { key: 'welcomePrompt', label: 'Lời chào' },
  { key: 'unknownPrompt', label: 'Tin nhắn không hiểu' },
  ...FLOW_GROUPS.flatMap((flow) => flow.fields.map((field) => ({ key: field.key, label: `${flow.title}: ${field.label}` }))),
];

const emptyFaqForm: FaqFormState = {
  title: '',
  body: '',
  keywordsText: '',
};

const createMessageId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const parseKeywords = (input: string) =>
  input
    .split(/[,;\n\r]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const formatKeywords = (keywords?: string[]) => (keywords || []).join(', ');

const normalizeSearch = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

const digitsOnly = (value: string) => value.replace(/\D+/g, '');

const parsePositiveInt = (value: string) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const sortQuickActions = (payload: BotScenarioPayload): BotScenarioPayload => {
  const usedIndexes = new Set<number>();
  const requiredActions = QUICK_ACTION_ORDER.map((key) => {
    const existingIndex = payload.quickActions.findIndex((item, index) => item.key === key && !usedIndexes.has(index));
    if (existingIndex >= 0) {
      usedIndexes.add(existingIndex);
      return payload.quickActions[existingIndex];
    }
    return { key, label: QUICK_ACTION_LABEL[key] };
  });
  const extraActions = payload.quickActions.filter((_, index) => !usedIndexes.has(index));
  return {
    ...payload,
    quickActions: [...requiredActions, ...extraActions],
  };
};

const getActionLabel = (payload: BotScenarioPayload, key: BotScenarioActionKey) =>
  payload.quickActions.find((item) => item.key === key)?.label || QUICK_ACTION_LABEL[key];

const getRequiredQuickActionIndexes = (payload: BotScenarioPayload) => {
  const indexes = new Set<number>();
  QUICK_ACTION_ORDER.forEach((key) => {
    const index = payload.quickActions.findIndex((item, itemIndex) => item.key === key && !indexes.has(itemIndex));
    if (index >= 0) {
      indexes.add(index);
    }
  });
  return indexes;
};

const getExtraQuickActionEntries = (payload: BotScenarioPayload) => {
  const requiredIndexes = getRequiredQuickActionIndexes(payload);
  return payload.quickActions
    .map((action, index) => ({ action, index }))
    .filter((entry) => !requiredIndexes.has(entry.index));
};

const createBotMessage = (text: string, actions?: BotScenarioQuickAction[]): DraftSimulatorMessage => ({
  id: createMessageId(),
  role: 'bot',
  text,
  actions,
});

const createUserMessage = (text: string): DraftSimulatorMessage => ({
  id: createMessageId(),
  role: 'user',
  text,
});

const createMenuMessage = (prompt: string, payload: BotScenarioPayload) =>
  createBotMessage(prompt, payload.quickActions.filter((action) => action.label.trim()));

const recommendSize = (heightCm: number, weightKg: number) => {
  if (heightCm < 160 || weightKg < 52) return 'S';
  if (heightCm < 168 || weightKg < 60) return 'M';
  if (heightCm < 176 || weightKg < 70) return 'L';
  if (heightCm < 184 || weightKg < 80) return 'XL';
  return 'XXL';
};

const findFaqMatch = (query: string, items: ContentPage[]) => {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return undefined;

  return items.find((item) => {
    const keywords = item.keywords || [];
    const keywordMatched = keywords.some((keyword) => {
      const normalizedKeyword = normalizeSearch(keyword);
      return normalizedKeyword && (normalizedQuery.includes(normalizedKeyword) || normalizedKeyword.includes(normalizedQuery));
    });

    if (keywordMatched) return true;

    const normalizedTitle = normalizeSearch(item.title);
    return normalizedTitle.includes(normalizedQuery) || normalizedQuery.includes(normalizedTitle);
  });
};

const formatMeta = (meta?: BotScenarioSnapshot['draftMeta']) => {
  if (!meta) return 'Chưa có dữ liệu';
  const timestamp = meta.updatedAt ? new Date(meta.updatedAt).toLocaleString('vi-VN') : 'chưa rõ thời gian';
  return `v${meta.version} · ${timestamp}${meta.updatedBy ? ` · ${meta.updatedBy}` : ''}`;
};

const getScenarioIssues = (payload: BotScenarioPayload | null) => {
  if (!payload) {
    return {
      emptyFields: REQUIRED_PROMPT_FIELDS,
      duplicateQuickActionLabels: [] as string[],
      missingActions: QUICK_ACTION_ORDER,
      emptyQuickActionLabels: 0,
    };
  }

  const emptyFields = REQUIRED_PROMPT_FIELDS.filter((field) => !String(payload[field.key] || '').trim());
  const missingActions = QUICK_ACTION_ORDER.filter((key) => !payload.quickActions.some((action) => action.key === key && action.label.trim()));
  const seenLabels = new Map<string, string>();
  const duplicateQuickActionLabels: string[] = [];
  let emptyQuickActionLabels = 0;

  payload.quickActions.forEach((action) => {
    if (!action.label.trim()) {
      emptyQuickActionLabels += 1;
      return;
    }
    const normalizedLabel = normalizeSearch(action.label);
    if (!normalizedLabel) return;
    if (seenLabels.has(normalizedLabel)) {
      duplicateQuickActionLabels.push(action.label);
      return;
    }
    seenLabels.set(normalizedLabel, action.label);
  });

  return { emptyFields, duplicateQuickActionLabels, missingActions, emptyQuickActionLabels };
};

const AdminBotAI = () => {
  const { pushToast } = useAdminToast();
  const [snapshot, setSnapshot] = useState<BotScenarioSnapshot | null>(null);
  const [draft, setDraft] = useState<BotScenarioPayload | null>(null);
  const [faqItems, setFaqItems] = useState<ContentPage[]>([]);
  const [faqForm, setFaqForm] = useState<FaqFormState>(emptyFaqForm);
  const [loading, setLoading] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [savingFaq, setSavingFaq] = useState(false);
  const [activeTab, setActiveTab] = useState<BotAdminTab>('faq');
  const [faqSearch, setFaqSearch] = useState('');
  const [simulatorMessages, setSimulatorMessages] = useState<DraftSimulatorMessage[]>([]);
  const [simulatorInput, setSimulatorInput] = useState('');
  const [simulatorStep, setSimulatorStep] = useState<DraftSimulatorStep>('menu');
  const [pendingOrderCode, setPendingOrderCode] = useState('');
  const [pendingHeight, setPendingHeight] = useState<number | null>(null);
  const [deleteFaqTarget, setDeleteFaqTarget] = useState<ContentPage | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [scenarioSnapshot, faqList] = await Promise.all([
        adminBotScenarioService.getSnapshot(),
        contentService.list('FAQ'),
      ]);
      setSnapshot(scenarioSnapshot);
      setDraft(sortQuickActions(scenarioSnapshot.draft));
      setFaqItems(faqList);
    } catch {
      pushToast('Không thể tải dữ liệu Bot/AI.');
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!draft) return;
    if (activeTab === 'test') {
      setSimulatorMessages([createMenuMessage(draft.welcomePrompt, draft)]);
      setSimulatorInput('');
      setSimulatorStep('menu');
      setPendingOrderCode('');
      setPendingHeight(null);
      return;
    }
    setSimulatorMessages((current) => (current.length ? current : [createMenuMessage(draft.welcomePrompt, draft)]));
  }, [activeTab, draft]);

  const scenarioIssues = useMemo(() => getScenarioIssues(draft), [draft]);
  const extraQuickActionEntries = useMemo(() => (draft ? getExtraQuickActionEntries(draft) : []), [draft]);
  const publishReady =
    scenarioIssues.emptyFields.length === 0 &&
    scenarioIssues.emptyQuickActionLabels === 0 &&
    scenarioIssues.duplicateQuickActionLabels.length === 0 &&
    scenarioIssues.missingActions.length === 0;

  const hasDraftChanged = useMemo(() => {
    if (!snapshot || !draft) return false;
    return JSON.stringify(sortQuickActions(snapshot.draft)) !== JSON.stringify(sortQuickActions(draft));
  }, [snapshot, draft]);

  const canPublish = Boolean(snapshot && draft && publishReady && !hasDraftChanged);

  const filteredFaqItems = useMemo(() => {
    const normalizedSearch = normalizeSearch(faqSearch);
    if (!normalizedSearch) return faqItems;

    return faqItems.filter((item) => {
      const haystack = normalizeSearch([item.title, item.body, ...(item.keywords || [])].join(' '));
      return haystack.includes(normalizedSearch);
    });
  }, [faqItems, faqSearch]);

  const updateDraftField = <K extends keyof BotScenarioPayload>(field: K, value: BotScenarioPayload[K]) => {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
  };

  const updateQuickActionLabel = (key: BotScenarioActionKey, label: string) => {
    setDraft((current) => {
      if (!current) return current;
      let updated = false;
      return {
        ...current,
        quickActions: current.quickActions.map((item) => {
          if (updated || item.key !== key) return item;
          updated = true;
          return { ...item, label };
        }),
      };
    });
  };

  const addExtraQuickAction = () => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        quickActions: [
          ...current.quickActions,
          { key: DEFAULT_EXTRA_QUICK_ACTION, label: '' },
        ],
      };
    });
  };

  const updateQuickActionAt = (index: number, value: BotScenarioQuickAction) => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        quickActions: current.quickActions.map((item, itemIndex) => (itemIndex === index ? value : item)),
      };
    });
  };

  const removeQuickActionAt = (index: number) => {
    setDraft((current) => {
      if (!current) return current;
      const requiredIndexes = getRequiredQuickActionIndexes(current);
      if (requiredIndexes.has(index)) return current;
      return {
        ...current,
        quickActions: current.quickActions.filter((_, itemIndex) => itemIndex !== index),
      };
    });
  };

  const resetSimulator = useCallback(() => {
    if (!draft) return;
    setSimulatorMessages([createMenuMessage(draft.welcomePrompt, draft)]);
    setSimulatorInput('');
    setSimulatorStep('menu');
    setPendingOrderCode('');
    setPendingHeight(null);
  }, [draft]);

  const startSimulatorAction = (
    actionKey: BotScenarioActionKey,
    label = draft ? getActionLabel(draft, actionKey) : '',
    options: { includeUserMessage?: boolean; prefix?: DraftSimulatorMessage[] } = {},
  ) => {
    if (!draft) return;

    const nextMessages: DraftSimulatorMessage[] = [...(options.prefix || [])];
    if (options.includeUserMessage !== false) {
      nextMessages.push(createUserMessage(label));
    }
    if (actionKey === 'ORDER_LOOKUP') {
      nextMessages.push(createBotMessage(draft.askOrderCodePrompt));
      setSimulatorStep('awaitOrderCode');
    }
    if (actionKey === 'SIZE_ADVICE') {
      nextMessages.push(createBotMessage(draft.askHeightPrompt));
      setSimulatorStep('awaitHeight');
    }
    if (actionKey === 'PRODUCT_FAQ') {
      const matchedFaq = findFaqMatch(label, faqItems);
      if (matchedFaq) {
        nextMessages.push(
          createBotMessage(matchedFaq.body),
          createMenuMessage(draft.productFaqContinuePrompt, draft),
        );
        setSimulatorStep('menu');
      } else {
        nextMessages.push(createBotMessage('Nhập câu hỏi hoặc keyword FAQ để kiểm tra câu trả lời nháp.'));
        setSimulatorStep('faqQuestion');
      }
    }
    setSimulatorMessages((current) => [...current, ...nextMessages]);
  };

  const handleSimulatorSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft) return;

    const value = simulatorInput.trim();
    if (!value) return;

    setSimulatorInput('');
    const nextMessages: DraftSimulatorMessage[] = [createUserMessage(value)];

    if (simulatorStep === 'menu') {
      const matchedAction = draft.quickActions.find((action) => normalizeSearch(action.label) === normalizeSearch(value));
      if (matchedAction) {
        startSimulatorAction(matchedAction.key, matchedAction.label, { includeUserMessage: false, prefix: nextMessages });
        return;
      }
      const matchedFaq = findFaqMatch(value, faqItems);
      if (matchedFaq) {
        nextMessages.push(
          createBotMessage(matchedFaq.body),
          createMenuMessage(draft.productFaqContinuePrompt, draft),
        );
      } else {
        nextMessages.push(createMenuMessage(draft.unknownPrompt, draft));
      }
    }

    if (simulatorStep === 'awaitOrderCode') {
      setPendingOrderCode(value.toUpperCase());
      setSimulatorStep('awaitOrderPhone');
      nextMessages.push(createBotMessage(draft.askOrderPhonePrompt));
    }

    if (simulatorStep === 'awaitOrderPhone') {
      const phone4 = digitsOnly(value);
      if (phone4.length !== 4) {
        nextMessages.push(createBotMessage(draft.orderPhoneInvalidPrompt));
      } else {
        nextMessages.push(
          createBotMessage(`Đã nhận mã ${pendingOrderCode || 'đơn hàng'} và 4 số cuối SĐT. Runtime sẽ gọi backend để trả trạng thái đơn thật.`),
          createMenuMessage(draft.orderLookupContinuePrompt, draft),
        );
        setPendingOrderCode('');
        setSimulatorStep('menu');
      }
    }

    if (simulatorStep === 'awaitHeight') {
      const height = parsePositiveInt(value);
      if (!height || height < 120 || height > 230) {
        nextMessages.push(createBotMessage(draft.invalidHeightPrompt));
      } else {
        setPendingHeight(height);
        setSimulatorStep('awaitWeight');
        nextMessages.push(createBotMessage(draft.askWeightPrompt));
      }
    }

    if (simulatorStep === 'awaitWeight') {
      const weight = parsePositiveInt(value);
      if (!weight || weight < 30 || weight > 200 || !pendingHeight) {
        nextMessages.push(createBotMessage(draft.invalidWeightPrompt));
      } else {
        const suggestedSize = recommendSize(pendingHeight, weight);
        nextMessages.push(
          createBotMessage(`Với chiều cao ${pendingHeight}cm và cân nặng ${weight}kg, size gợi ý là ${suggestedSize}.`),
          createMenuMessage(draft.sizeAdviceContinuePrompt, draft),
        );
        setPendingHeight(null);
        setSimulatorStep('menu');
      }
    }

    if (simulatorStep === 'faqQuestion') {
      const matchedFaq = findFaqMatch(value, faqItems);
      nextMessages.push(
        createBotMessage(
          matchedFaq
            ? matchedFaq.body
            : 'Chưa tìm thấy FAQ phù hợp trong danh sách keyword hiện tại.',
        ),
        createMenuMessage(draft.productFaqContinuePrompt, draft),
      );
      setSimulatorStep('menu');
    }

    setSimulatorMessages((current) => [...current, ...nextMessages]);
  };

  const handleSaveDraft = async () => {
    if (!draft) return;
    try {
      setSavingDraft(true);
      const nextSnapshot = await adminBotScenarioService.saveDraft(sortQuickActions(draft));
      setSnapshot(nextSnapshot);
      setDraft(sortQuickActions(nextSnapshot.draft));
      pushToast('Đã lưu nháp kịch bản bot.');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Không thể lưu nháp.');
    } finally {
      setSavingDraft(false);
    }
  };

  const handlePublish = async () => {
    if (!canPublish) {
      pushToast(hasDraftChanged ? 'Hãy lưu nháp trước khi publish.' : 'Kịch bản chưa sẵn sàng để publish.');
      return;
    }

    try {
      setPublishing(true);
      const nextSnapshot = await adminBotScenarioService.publishDraft();
      setSnapshot(nextSnapshot);
      setDraft(sortQuickActions(nextSnapshot.draft));
      pushToast('Đã publish kịch bản chatbot.');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Không thể publish.');
    } finally {
      setPublishing(false);
    }
  };

  const handleResetDraft = async () => {
    try {
      const nextSnapshot = await adminBotScenarioService.resetDraftFromPublished();
      setSnapshot(nextSnapshot);
      setDraft(sortQuickActions(nextSnapshot.draft));
      setSimulatorMessages([]);
      pushToast('Đã khôi phục draft theo bản published.');
    } catch {
      pushToast('Không thể khôi phục draft.');
    }
  };

  const openFaqEditor = (item?: ContentPage) => {
    if (!item) {
      setFaqForm(emptyFaqForm);
      return;
    }
    setFaqForm({
      id: item.id,
      title: item.title,
      body: item.body,
      keywordsText: formatKeywords(item.keywords),
    });
  };

  const handleSaveFaq = async () => {
    if (!faqForm.title.trim() || !faqForm.body.trim()) {
      pushToast('FAQ cần có tiêu đề và nội dung.');
      return;
    }

    const payload = {
      title: faqForm.title.trim(),
      body: faqForm.body.trim(),
      type: 'FAQ' as const,
      displayOrder: faqForm.id ? faqItems.find((item) => item.id === faqForm.id)?.displayOrder : faqItems.length + 1,
      keywords: parseKeywords(faqForm.keywordsText),
    };

    try {
      setSavingFaq(true);
      if (faqForm.id) {
        const updated = await contentService.update(faqForm.id, payload);
        setFaqItems((prev) => prev.map((item) => (item.id === faqForm.id ? updated : item)));
        pushToast('Đã cập nhật FAQ.');
      } else {
        const created = await contentService.create(payload);
        setFaqItems((prev) => [...prev, created]);
        pushToast('Đã tạo FAQ mới.');
      }
      setFaqForm(emptyFaqForm);
    } catch {
      pushToast('Không thể lưu FAQ.');
    } finally {
      setSavingFaq(false);
    }
  };

  const handleDeleteFaq = (id: string) => {
    const target = faqItems.find((item) => item.id === id);
    if (!target) return;
    setDeleteFaqTarget(target);
  };

  const confirmDeleteFaq = async () => {
    if (!deleteFaqTarget) return;
    try {
      await contentService.remove(deleteFaqTarget.id);
      setFaqItems((prev) => prev.filter((item) => item.id !== deleteFaqTarget.id));
      if (faqForm.id === deleteFaqTarget.id) {
        setFaqForm(emptyFaqForm);
      }
      setDeleteFaqTarget(null);
      pushToast('Đã xóa FAQ.');
    } catch {
      pushToast('Không thể xóa FAQ.');
    }
  };

  const renderPromptInput = (field: PromptField, index: number) => {
    if (!draft) return null;
    return (
      <label className="bot-ai-step" key={field.key}>
        <span className="bot-ai-step-index">{index + 1}</span>
        <span className="bot-ai-step-body">
          <span className="bot-ai-step-label">{field.label}</span>
          <span className="bot-ai-field-helper">{field.helper}</span>
          <textarea
            value={draft[field.key]}
            onChange={(e) => updateDraftField(field.key, e.target.value)}
            rows={field.rows || 2}
          />
        </span>
      </label>
    );
  };

  const renderReadinessChecklist = () => (
    <div className="bot-ai-checklist">
      <div className={`bot-ai-checklist-row ${scenarioIssues.emptyFields.length ? 'warning' : 'ready'}`}>
        {scenarioIssues.emptyFields.length ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
        <span>{scenarioIssues.emptyFields.length ? `${scenarioIssues.emptyFields.length} prompt còn trống` : 'Đủ prompt bắt buộc'}</span>
      </div>
      <div className={`bot-ai-checklist-row ${scenarioIssues.missingActions.length ? 'warning' : 'ready'}`}>
        {scenarioIssues.missingActions.length ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
        <span>{scenarioIssues.missingActions.length ? 'Thiếu quick action bắt buộc' : 'Đủ action bắt buộc'}</span>
      </div>
      <div className={`bot-ai-checklist-row ${scenarioIssues.emptyQuickActionLabels ? 'warning' : 'ready'}`}>
        {scenarioIssues.emptyQuickActionLabels ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
        <span>{scenarioIssues.emptyQuickActionLabels ? `${scenarioIssues.emptyQuickActionLabels} quick prompt chưa có nội dung` : 'Quick prompt đã có nội dung'}</span>
      </div>
      <div className={`bot-ai-checklist-row ${scenarioIssues.duplicateQuickActionLabels.length ? 'warning' : 'ready'}`}>
        {scenarioIssues.duplicateQuickActionLabels.length ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
        <span>{scenarioIssues.duplicateQuickActionLabels.length ? 'Quick action bị trùng nhãn' : 'Nhãn quick action không trùng'}</span>
      </div>
      <div className={`bot-ai-checklist-row ${hasDraftChanged ? 'warning' : 'ready'}`}>
        {hasDraftChanged ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
        <span>{hasDraftChanged ? 'Có thay đổi chưa lưu' : 'Draft đã đồng bộ với server'}</span>
      </div>
    </div>
  );

  const renderFlowsTab = () => {
    if (!draft) return null;

    return (
      <div className="bot-ai-workspace with-preview">
        <div className="bot-ai-column">
          <section className="bot-ai-section">
            <div className="bot-ai-section-head">
              <div>
                <h3><MessageSquare size={16} /> Mở đầu & fallback</h3>
                <p className="admin-muted small">Hai prompt này xuất hiện ở điểm đầu và khi bot không hiểu ý khách.</p>
              </div>
            </div>
            <label>
              Lời chào
              <textarea
                value={draft.welcomePrompt}
                onChange={(e) => updateDraftField('welcomePrompt', e.target.value)}
                rows={3}
              />
            </label>
            <label>
              Tin nhắn không hiểu
              <textarea
                value={draft.unknownPrompt}
                onChange={(e) => updateDraftField('unknownPrompt', e.target.value)}
                rows={2}
              />
            </label>
          </section>

          <section className="bot-ai-section">
            <div className="bot-ai-section-head">
              <div>
                <h3><Plus size={16} /> Quick prompt bổ sung</h3>
                <p className="admin-muted small">Thêm nhiều nút nhanh vào menu; mỗi nút sẽ trỏ về một luồng xử lý có sẵn.</p>
              </div>
              <button type="button" className="admin-primary-btn dark" onClick={addExtraQuickAction}>
                <Plus size={16} /> Thêm prompt
              </button>
            </div>
            <div className="bot-ai-quick-action-list">
              {extraQuickActionEntries.length === 0 ? (
                <p className="admin-muted small">Chưa có quick prompt bổ sung.</p>
              ) : (
                extraQuickActionEntries.map(({ action, index }) => (
                  <div className="bot-ai-quick-action-row" key={`${action.key}-${index}`}>
                    <label>
                      Luồng
                      <select
                        value={action.key}
                        onChange={(event) => updateQuickActionAt(index, { ...action, key: event.target.value as BotScenarioActionKey })}
                      >
                        {FLOW_GROUPS.map((flow) => (
                          <option key={flow.actionKey} value={flow.actionKey}>{flow.title}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Nội dung nút
                      <input
                        value={action.label}
                        onChange={(event) => updateQuickActionAt(index, { ...action, label: event.target.value })}
                        placeholder="Ví dụ: Phí vận chuyển?"
                      />
                    </label>
                    <button type="button" className="admin-icon-btn subtle danger-icon" onClick={() => removeQuickActionAt(index)} title="Xóa quick prompt">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          <div className="bot-ai-flow-board">
            {FLOW_GROUPS.map((flow) => {
              const FlowIcon = flow.icon;
              return (
                <section className="bot-ai-flow-card" key={flow.id}>
                  <div className="bot-ai-flow-head">
                    <div className="bot-ai-flow-icon"><FlowIcon size={18} /></div>
                    <div className="bot-ai-flow-meta">
                      <h3>{flow.title}</h3>
                      <p>{flow.description}</p>
                    </div>
                  </div>
                  <label className="bot-ai-action-label">
                    Nhãn quick action
                    <input
                      value={getActionLabel(draft, flow.actionKey)}
                      onChange={(e) => updateQuickActionLabel(flow.actionKey, e.target.value)}
                    />
                  </label>
                  <div className="bot-ai-step-list">
                    {flow.fields.map(renderPromptInput)}
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        <aside className="bot-ai-preview">
          <h3>Published hiện tại</h3>
          <p className="admin-muted small">Runtime chatbot đang dùng bản Published, không dùng nội dung đang gõ nếu chưa lưu và publish.</p>
          <div className="bot-ai-preview-card">
            <p className="bot-ai-preview-title">Welcome</p>
            <p>{snapshot?.published.welcomePrompt}</p>
            <p className="bot-ai-preview-title">Quick actions</p>
            <div className="bot-ai-keyword-wrap">
              {snapshot?.published.quickActions.map((action, index) => (
                <span key={`${action.key}-${index}`} className="admin-pill neutral">{action.label}</span>
              ))}
            </div>
            <p className="bot-ai-preview-title">Unknown</p>
            <p>{snapshot?.published.unknownPrompt}</p>
          </div>
        </aside>
      </div>
    );
  };

  const renderTestTab = () => {
    if (!draft) return null;

    return (
      <div className="bot-ai-test-shell">
        <section className="bot-ai-chat-card">
          <div className="bot-ai-chat-head">
            <div>
              <h3><PlayCircle size={16} /> Test Draft local</h3>
              <p className="admin-muted small">Kiểm tra nhanh nội dung draft và FAQ trước khi lưu/publish.</p>
            </div>
            <button type="button" className="admin-icon-btn subtle" onClick={resetSimulator} title="Reset test">
              <RefreshCcw size={16} />
            </button>
          </div>
          <div className="bot-ai-chat-log" aria-live="polite">
            {simulatorMessages.map((message) => (
              <div className={`bot-ai-message ${message.role}`} key={message.id}>
                <p>{message.text}</p>
                {message.actions?.length ? (
                  <div className="bot-ai-message-actions">
                    {message.actions.map((action, index) => (
                      <button type="button" key={`${action.key}-${index}`} onClick={() => startSimulatorAction(action.key, action.label)}>
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <form className="bot-ai-chat-input" onSubmit={handleSimulatorSubmit}>
            <input
              value={simulatorInput}
              onChange={(e) => setSimulatorInput(e.target.value)}
              placeholder="Nhập phản hồi để test luồng..."
              aria-label="Nhập phản hồi để test chatbot draft"
            />
            <button type="submit" className="admin-primary-btn">
              <Send size={16} /> Gửi
            </button>
          </form>
        </section>

        <aside className="bot-ai-section">
          <h3><ClipboardCheck size={16} /> Trạng thái publish</h3>
          {renderReadinessChecklist()}
          {scenarioIssues.emptyFields.length ? (
            <div className="bot-ai-issue-list">
              {scenarioIssues.emptyFields.slice(0, 6).map((field) => (
                <span key={field.key}>{field.label}</span>
              ))}
            </div>
          ) : null}
        </aside>
      </div>
    );
  };

  const renderFaqTab = () => (
    <div className="bot-ai-faq-panel">
      <div className="bot-ai-faq-toolbar">
        <label className="bot-ai-search">
          <Search size={16} />
          <input
            value={faqSearch}
            onChange={(e) => setFaqSearch(e.target.value)}
            placeholder="Tìm FAQ theo tiêu đề, nội dung, keyword..."
          />
        </label>
        <button type="button" className="admin-primary-btn" onClick={() => openFaqEditor()}>
          <Plus size={16} /> Tạo FAQ
        </button>
      </div>

      <div className="bot-ai-faq-layout">
        <div className="bot-ai-faq-list">
          {filteredFaqItems.length === 0 ? (
            <p className="admin-muted">Chưa có FAQ phù hợp.</p>
          ) : (
            filteredFaqItems.map((item) => (
              <div key={item.id} className={`bot-ai-faq-card ${faqForm.id === item.id ? 'active' : ''}`}>
                <div className="bot-ai-faq-card-head">
                  <h4><FileText size={14} /> {item.title}</h4>
                  <div className="admin-actions">
                    <button type="button" className="admin-icon-btn subtle" onClick={() => openFaqEditor(item)} title="Sửa FAQ">
                      <Pencil size={14} />
                    </button>
                    <button type="button" className="admin-icon-btn subtle danger-icon" onClick={() => void handleDeleteFaq(item.id)} title="Xóa FAQ">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p className="admin-muted">{item.body}</p>
                <div className="bot-ai-keyword-wrap">
                  {(item.keywords || []).map((keyword) => (
                    <span key={`${item.id}-${keyword}`} className="admin-pill neutral">{keyword}</span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="bot-ai-faq-side">
          <div className="bot-ai-faq-editor">
            <h3>{faqForm.id ? 'Chỉnh sửa FAQ' : 'FAQ mới'}</h3>
            <label>
              Tiêu đề
              <input
                value={faqForm.title}
                onChange={(e) => setFaqForm((prev) => ({ ...prev, title: e.target.value }))}
              />
            </label>
            <label>
              Nội dung trả lời
              <textarea
                value={faqForm.body}
                onChange={(e) => setFaqForm((prev) => ({ ...prev, body: e.target.value }))}
                rows={6}
              />
            </label>
            <label>
              Keywords
              <textarea
                value={faqForm.keywordsText}
                onChange={(e) => setFaqForm((prev) => ({ ...prev, keywordsText: e.target.value }))}
                rows={4}
                placeholder="Tách bằng dấu phẩy hoặc xuống dòng"
              />
            </label>
            <div className="admin-topbar-actions">
              <button type="button" className="admin-primary-btn dark" onClick={() => setFaqForm(emptyFaqForm)}>
                Làm mới form
              </button>
              <button type="button" className="admin-primary-btn" onClick={() => void handleSaveFaq()} disabled={savingFaq}>
                <Save size={16} /> {savingFaq ? 'Đang lưu...' : 'Lưu FAQ'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <AdminLayout title="Bot và AI" breadcrumbs={['Bot và AI', 'Quản lý kịch bản chatbot']}>
      <div className="admin-panels single">
        <section className="admin-panel">
          <div className="admin-panel-head bot-ai-head">
            <div>
              <h2>Quản lý kịch bản chatbot</h2>
              <p className="admin-muted">
                Chỉnh nội dung theo từng luồng, test draft trước khi publish lên runtime Azure Bot/WebChat.
              </p>
            </div>
            <div className="admin-topbar-actions">
              <button type="button" className="admin-icon-btn subtle" onClick={() => void loadData()} title="Tải lại dữ liệu">
                <RefreshCcw size={16} />
              </button>
              <button type="button" className="admin-primary-btn dark" onClick={handleResetDraft} disabled={loading || !snapshot}>
                <RefreshCcw size={16} /> Khôi phục draft
              </button>
              <button type="button" className="admin-primary-btn" onClick={handleSaveDraft} disabled={loading || !draft || savingDraft || !hasDraftChanged}>
                <Save size={16} /> {savingDraft ? 'Đang lưu...' : 'Lưu nháp'}
              </button>
              <button type="button" className="admin-primary-btn" onClick={handlePublish} disabled={loading || publishing || !canPublish}>
                <UploadCloud size={16} /> {publishing ? 'Đang publish...' : 'Publish'}
              </button>
            </div>
          </div>

          {loading || !draft ? (
            <p className="admin-muted">Đang tải kịch bản chatbot...</p>
          ) : (
            <>
              <div className="bot-ai-summary-grid">
                <div className="bot-ai-status-card">
                  <span className="bot-ai-status-icon"><GitBranch size={18} /></span>
                  <div>
                    <strong>Draft</strong>
                    <p>{formatMeta(snapshot?.draftMeta)}</p>
                  </div>
                </div>
                <div className="bot-ai-status-card">
                  <span className="bot-ai-status-icon"><UploadCloud size={18} /></span>
                  <div>
                    <strong>Published</strong>
                    <p>{formatMeta(snapshot?.publishedMeta)}</p>
                  </div>
                </div>
                <div className={`bot-ai-status-card ${publishReady ? 'ready' : 'warning'}`}>
                  <span className="bot-ai-status-icon">
                    {publishReady ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                  </span>
                  <div>
                    <strong>{publishReady ? 'Sẵn sàng' : 'Cần kiểm tra'}</strong>
                    <p>{publishReady ? 'Kịch bản đủ điều kiện publish' : 'Có prompt/action cần xử lý'}</p>
                  </div>
                </div>
                <div className="bot-ai-status-card">
                  <span className="bot-ai-status-icon"><FileText size={18} /></span>
                  <div>
                    <strong>{faqItems.length} FAQ</strong>
                    <p>{filteredFaqItems.length} mục đang hiển thị</p>
                  </div>
                </div>
              </div>

              <div className="admin-filter-toolbar bot-ai-tabs">
                <span className="admin-filter-toolbar-spacer" aria-hidden="true" />
                <PanelFilterSelect
                  label="Khu vực"
                  ariaLabel="Chọn khu vực quản lý Bot AI"
                  items={BOT_ADMIN_TABS.map((tab) => ({ key: tab.id, label: tab.label }))}
                  value={activeTab}
                  onChange={(key) => setActiveTab(key as BotAdminTab)}
                />
              </div>

              {activeTab === 'flows' ? renderFlowsTab() : null}
              {activeTab === 'test' ? renderTestTab() : null}
              {activeTab === 'faq' ? renderFaqTab() : null}
            </>
          )}
        </section>
      </div>
      <AdminConfirmDialog
        open={Boolean(deleteFaqTarget)}
        title="Xóa FAQ"
        description="FAQ này sẽ bị xóa khỏi knowledge base của Bot/AI. Hành động này không thể hoàn tác."
        selectedItems={deleteFaqTarget ? [deleteFaqTarget.title] : undefined}
        selectedNoun="FAQ"
        confirmLabel="Xóa FAQ"
        danger
        onCancel={() => setDeleteFaqTarget(null)}
        onConfirm={() => void confirmDeleteFaq()}
      />
    </AdminLayout>
  );
};

export default AdminBotAI;
