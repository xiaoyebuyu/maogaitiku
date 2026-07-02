import { useEffect, useMemo, useState } from "react";

type QuestionType = "single" | "multiple" | "judge" | "blank" | "short_answer";

type Question = {
  id: string;
  type: QuestionType;
  question: string;
  options: Record<string, string>;
  answer: string;
  source: string;
};

type Mode = "home" | "practice";
type PracticeKind = "sequence" | "random" | "type" | "wrong";

type SavedState = {
  answered: Record<string, { correct: boolean; selected: string; updatedAt: string }>;
  wrongIds: string[];
  progress: Partial<Record<PracticeKind | QuestionType, number>>;
};

const storageKey = "maogai-practice-state-v1";

const typeLabels: Record<QuestionType, string> = {
  single: "单选题",
  multiple: "多选题",
  judge: "判断题",
  blank: "填空题",
  short_answer: "简答题",
};

const emptyState: SavedState = {
  answered: {},
  wrongIds: [],
  progress: {},
};

function loadSavedState(): SavedState {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved ? { ...emptyState, ...JSON.parse(saved) } : emptyState;
  } catch {
    return emptyState;
  }
}

function saveState(state: SavedState) {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

function normalizeAnswer(answer: string) {
  return answer.replace(/\s+/g, "").replace(/[，、,]/g, "").toUpperCase();
}

function isCorrect(question: Question, selected: string) {
  if (question.type === "short_answer" || question.type === "blank") {
    return normalizeAnswer(selected) === normalizeAnswer(question.answer);
  }
  return normalizeAnswer(selected) === normalizeAnswer(question.answer);
}

export default function App() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [saved, setSaved] = useState<SavedState>(loadSavedState);
  const [mode, setMode] = useState<Mode>("home");
  const [practiceKind, setPracticeKind] = useState<PracticeKind>("sequence");
  const [selectedType, setSelectedType] = useState<QuestionType>("single");
  const [queue, setQueue] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    fetch("./questions.json")
      .then((response) => {
        if (!response.ok) throw new Error("题库文件读取失败");
        return response.json();
      })
      .then((data: Question[]) => setQuestions(data))
      .catch((error: Error) => setLoadError(error.message));
  }, []);

  useEffect(() => saveState(saved), [saved]);

  const counts = useMemo(() => {
    return questions.reduce<Record<QuestionType, number>>(
      (acc, question) => {
        acc[question.type] += 1;
        return acc;
      },
      { single: 0, multiple: 0, judge: 0, blank: 0, short_answer: 0 },
    );
  }, [questions]);

  const stats = useMemo(() => {
    const records = Object.values(saved.answered);
    const correct = records.filter((record) => record.correct).length;
    const wrong = records.filter((record) => !record.correct).length;
    const total = records.length;
    return {
      total,
      correct,
      wrong,
      rate: total ? Math.round((correct / total) * 100) : 0,
    };
  }, [saved]);

  const current = queue[index];
  const savedRecord = current ? saved.answered[current.id] : null;

  function startPractice(kind: PracticeKind, type?: QuestionType) {
    let nextQueue = questions;
    let progressKey: PracticeKind | QuestionType = kind;

    if (kind === "random") nextQueue = shuffle(questions);
    if (kind === "type" && type) {
      nextQueue = questions.filter((question) => question.type === type);
      progressKey = type;
      setSelectedType(type);
    }
    if (kind === "wrong") {
      const wrongSet = new Set(saved.wrongIds);
      nextQueue = questions.filter((question) => wrongSet.has(question.id));
    }

    setPracticeKind(kind);
    setQueue(nextQueue);
    setIndex(Math.min(saved.progress[progressKey] ?? 0, Math.max(nextQueue.length - 1, 0)));
    setSelected("");
    setSubmitted(false);
    setMode("practice");
  }

  function restart() {
    startPractice(practiceKind, practiceKind === "type" ? selectedType : undefined);
  }

  function go(nextIndex: number) {
    const bounded = Math.min(Math.max(nextIndex, 0), queue.length - 1);
    setIndex(bounded);
    setSelected("");
    setSubmitted(false);
    const progressKey = practiceKind === "type" ? selectedType : practiceKind;
    setSaved((prev) => ({
      ...prev,
      progress: { ...prev.progress, [progressKey]: bounded },
    }));
  }

  function submitAnswer() {
    if (!current || !selected.trim()) return;
    const correct = isCorrect(current, selected);
    setSubmitted(true);
    setSaved((prev) => {
      const wrongIds = new Set(prev.wrongIds);
      if (correct) wrongIds.delete(current.id);
      else wrongIds.add(current.id);
      return {
        ...prev,
        answered: {
          ...prev.answered,
          [current.id]: { correct, selected, updatedAt: new Date().toISOString() },
        },
        wrongIds: [...wrongIds],
      };
    });
  }

  function clearRecords() {
    const next = { ...emptyState, answered: {}, wrongIds: [], progress: {} };
    setSaved(next);
    saveState(next);
  }

  if (loadError) {
    return <Shell><Empty title="题库读取失败" text={loadError} /></Shell>;
  }

  if (mode === "home") {
    return (
      <Shell>
        <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="panel p-6 sm:p-8">
            <p className="text-sm font-semibold text-teal-700">静态部署版刷题网站</p>
            <h1 className="mt-3 text-3xl font-bold text-slate-950 sm:text-4xl">毛概总题库</h1>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="题目总数" value={questions.length || "..."} />
              <Metric label="已做题数" value={stats.total} />
              <Metric label="正确数" value={stats.correct} />
              <Metric label="正确率" value={`${stats.rate}%`} />
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button className="primary-btn" onClick={() => startPractice("sequence")} disabled={!questions.length}>开始顺序练习</button>
              <button className="secondary-btn" onClick={() => startPractice("random")} disabled={!questions.length}>随机练习</button>
              <button className="secondary-btn" onClick={() => startPractice("wrong")} disabled={!saved.wrongIds.length}>只练错题</button>
            </div>
          </div>

          <div className="panel p-6">
            <h2 className="section-title">练习统计</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <ProgressLine label="正确" value={stats.correct} total={Math.max(stats.total, 1)} tone="bg-emerald-500" />
              <ProgressLine label="错误" value={stats.wrong} total={Math.max(stats.total, 1)} tone="bg-rose-500" />
              <p>错题本：{saved.wrongIds.length} 题</p>
              <button className="text-btn" onClick={clearRecords}>清空本地记录</button>
            </div>
          </div>
        </section>

        <section className="mt-5 panel p-6">
          <h2 className="section-title">按题型练习</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {(Object.keys(typeLabels) as QuestionType[]).map((type) => (
              <button key={type} className="type-btn" onClick={() => startPractice("type", type)} disabled={!counts[type]}>
                <span>{typeLabels[type]}</span>
                <strong>{counts[type]}</strong>
              </button>
            ))}
          </div>
        </section>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <button className="text-btn" onClick={() => setMode("home")}>返回首页</button>
        <div className="text-sm text-slate-600">
          {queue.length ? `${index + 1} / ${queue.length}` : "暂无题目"}
        </div>
      </div>

      {!current ? (
        <Empty title="没有可练习的题目" text="当前分类或错题本里暂无题目。" />
      ) : (
        <section className="panel p-5 sm:p-7">
          <div className="mb-5 flex flex-wrap gap-2">
            <Badge>{typeLabels[current.type]}</Badge>
            {current.source && <Badge>{current.source}</Badge>}
            {savedRecord && <Badge>{savedRecord.correct ? "上次正确" : "错题"}</Badge>}
          </div>

          <h1 className="whitespace-pre-line text-xl font-bold leading-8 text-slate-950">
            {current.question}
          </h1>

          <AnswerInput question={current} selected={selected} setSelected={setSelected} submitted={submitted} />

          {submitted && (
            <div className={`mt-5 rounded-lg border p-4 ${isCorrect(current, selected) ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
              <p className={`font-semibold ${isCorrect(current, selected) ? "text-emerald-700" : "text-rose-700"}`}>
                {isCorrect(current, selected) ? "回答正确" : "回答错误"}
              </p>
              <p className="mt-2 text-sm text-slate-700">正确答案：{current.answer}</p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button className="secondary-btn" onClick={() => go(index - 1)} disabled={index === 0}>上一题</button>
            <button className="primary-btn" onClick={submitAnswer} disabled={!selected.trim() || submitted}>提交</button>
            <button className="secondary-btn" onClick={() => go(index + 1)} disabled={index >= queue.length - 1}>下一题</button>
            <button className="secondary-btn" onClick={restart}>重新开始</button>
          </div>
        </section>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-5 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">{children}</div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function ProgressLine({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200">
        <div className={`h-2 rounded-full ${tone}`} style={{ width: `${Math.min((value / total) * 100, 100)}%` }} />
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">{children}</span>;
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="panel p-8 text-center">
      <h2 className="text-xl font-bold text-slate-950">{title}</h2>
      <p className="mt-2 text-slate-600">{text}</p>
    </div>
  );
}

function AnswerInput({
  question,
  selected,
  setSelected,
  submitted,
}: {
  question: Question;
  selected: string;
  setSelected: (value: string) => void;
  submitted: boolean;
}) {
  if (question.type === "single" || question.type === "judge") {
    const options = question.type === "judge" && Object.keys(question.options).length === 0
      ? { A: "正确", B: "错误" }
      : question.options;
    return (
      <div className="mt-6 space-y-3">
        {Object.entries(options).map(([key, value]) => (
          <button
            key={key}
            className={`option-btn ${selected === (question.type === "judge" ? value : key) ? "option-active" : ""}`}
            onClick={() => setSelected(question.type === "judge" ? value : key)}
            disabled={submitted}
          >
            <strong>{key}</strong>
            <span>{value}</span>
          </button>
        ))}
      </div>
    );
  }

  if (question.type === "multiple") {
    const selectedSet = new Set(selected.split(""));
    return (
      <div className="mt-6 space-y-3">
        {Object.entries(question.options).map(([key, value]) => (
          <button
            key={key}
            className={`option-btn ${selectedSet.has(key) ? "option-active" : ""}`}
            onClick={() => {
              if (submitted) return;
              selectedSet.has(key) ? selectedSet.delete(key) : selectedSet.add(key);
              setSelected([...selectedSet].sort().join(""));
            }}
            disabled={submitted}
          >
            <strong>{key}</strong>
            <span>{value}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <textarea
      className="mt-6 min-h-32 w-full resize-y rounded-lg border border-slate-300 bg-white p-4 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
      placeholder="输入你的答案"
      value={selected}
      onChange={(event) => setSelected(event.target.value)}
      disabled={submitted}
    />
  );
}
