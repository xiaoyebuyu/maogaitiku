import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mammoth from "mammoth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const inputFile = path.join(root, "data", "毛概总题库.docx");
const outputFile = path.join(root, "public", "questions.json");
const errorsFile = path.join(root, "public", "parse_errors.json");

const TYPE_LABELS = {
  single: "单选题",
  multiple: "多选题",
  judge: "判断题",
  blank: "填空题",
  short_answer: "简答题",
};

if (!fs.existsSync(inputFile)) {
  throw new Error(`找不到题库文件：${inputFile}`);
}

const { value: rawText, messages } = await mammoth.extractRawText({ path: inputFile });
const normalizedText = normalizeText(rawText);
const lines = normalizedText
  .split("\n")
  .map((line) => cleanLine(line))
  .filter(Boolean);

const blocks = collectQuestionBlocks(lines);
const questions = [];
const parseErrors = [];

for (const block of blocks) {
  const parsed = parseBlock(block);
  if (parsed.question) {
    questions.push(parsed.question);
  }
  if (parsed.errors.length > 0) {
    parseErrors.push({
      id: parsed.question?.id ?? block.id ?? null,
      type: parsed.question?.type ?? block.type ?? null,
      reason: parsed.errors,
      raw: block.lines.join("\n"),
    });
  }
}

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(questions, null, 2), "utf8");
fs.writeFileSync(
  errorsFile,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: "data/毛概总题库.docx",
      mammothMessages: messages,
      count: parseErrors.length,
      items: parseErrors,
    },
    null,
    2,
  ),
  "utf8",
);

console.log(`Parsed ${questions.length} questions.`);
console.log(`Wrote ${path.relative(root, outputFile)}.`);
console.log(`Wrote ${parseErrors.length} parse warnings to ${path.relative(root, errorsFile)}.`);

function normalizeText(text) {
  return text
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

function cleanLine(line) {
  return line
    .replace(/^[\s　]+|[\s　]+$/g, "")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[．]/g, ".")
    .replace(/[：]/g, ":")
    .replace(/[　]+/g, " ");
}

function collectQuestionBlocks(sourceLines) {
  const blocks = [];
  let current = null;
  let currentType = null;
  let fallbackId = 1;

  for (const line of sourceLines) {
    const headingType = detectHeadingType(line);
    if (headingType) {
      currentType = headingType;
      continue;
    }

    const start = matchQuestionStart(line);
    if (start) {
      if (current) blocks.push(current);
      current = {
        id: start.id || String(fallbackId++),
        type: currentType,
        lines: [start.text],
      };
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  if (current) blocks.push(current);
  return blocks;
}

function detectHeadingType(line) {
  const compact = line.replace(/\s/g, "");
  if (/多项?选择|多选/.test(compact)) return "multiple";
  if (/单项?选择|单选/.test(compact)) return "single";
  if (/判断|正误|是非/.test(compact)) return "judge";
  if (/填空/.test(compact)) return "blank";
  if (/简答|问答|论述|材料分析|辨析/.test(compact)) return "short_answer";
  return null;
}

function matchQuestionStart(line) {
  const ignored = /^(第?[一二三四五六七八九十]+[、.章节部分]|[一二三四五六七八九十]+[、.](单选|多选|判断|填空|简答))/;
  if (ignored.test(line)) return null;

  const match = line.match(/^(?:第)?(\d{1,4})[、.)]\s*(.+)$/);
  if (!match) return null;
  const afterNumber = match[2].trim();
  if (/^(页|章|节|部分|专题|单元)\b/.test(afterNumber)) return null;
  return { id: match[1], text: afterNumber };
}

function parseBlock(block) {
  const errors = [];
  const lines = block.lines.map(cleanLine).filter(Boolean);
  const joined = lines.join("\n");
  let source = extractSource(joined);
  let answer = extractExplicitAnswer(lines);
  let bodyLines = removeAnswerLines(lines);
  let body = bodyLines.join("\n");

  if (!source) {
    source = extractSource(body);
  }
  if (source) {
    body = body.replace(source.raw, "").trim();
  }

  const options = extractOptions(body);
  let questionText = options.questionText.replace(/[【\[]\s*[】\]]/g, "").trim();
  const optionMap = options.options;

  if (!answer) {
    const answerFromBlank = extractAnswerFromParentheses(questionText, block.type, optionMap);
    if (answerFromBlank) {
      answer = answerFromBlank.answer;
      if (answerFromBlank.remove) {
        questionText = questionText.replace(answerFromBlank.raw, "( )").trim();
      }
    }
  }

  const type = inferType(block.type, optionMap, answer, questionText);
  answer = normalizeAnswer(answer, type);

  if (!questionText) errors.push("缺少题干");
  if (!answer) errors.push("缺少答案");
  if ((type === "single" || type === "multiple") && Object.keys(optionMap).length < 2) {
    errors.push("选择题选项不足");
  }
  if (!source?.value) errors.push("未识别教材页码");

  if (!questionText) {
    return { question: null, errors };
  }

  return {
    question: {
      id: block.id,
      type,
      question: questionText,
      options: optionMap,
      answer,
      source: source?.value ?? "",
    },
    errors,
  };
}

function extractSource(text) {
  const matches = [...text.matchAll(/[【\[]?\s*(?:教材)?(?:第)?\s*(P?\d{1,4}(?:\s*[-—~至]\s*\d{1,4})?)\s*(?:页)?\s*[】\]]?/gi)];
  const valid = matches
    .map((match) => {
      const raw = match[0];
      const page = match[1]
        .toUpperCase()
        .replace(/^P?/, "P")
        .replace(/\s+/g, "")
        .replace(/[—~至]/g, "-");
      return { raw, value: page, index: match.index ?? 0 };
    })
    .filter((item) => /[Pp]/.test(item.raw) || /[【\[]/.test(item.raw) || /页/.test(item.raw));
  return valid.at(-1) ?? null;
}

function extractExplicitAnswer(lines) {
  const answerLines = [];
  for (const line of lines) {
    const match = line.match(/^(?:答案|正确答案|参考答案|【答案】|\[答案\])[:：]?\s*(.+)$/i);
    if (match) {
      answerLines.push(match[1].trim());
      continue;
    }
    const inline = line.match(/(?:答案|正确答案|参考答案)[:：]\s*([A-Fa-f,，、\s√×对错正确错误是否]+)$/);
    if (inline) answerLines.push(inline[1].trim());
  }
  return answerLines.join("\n").trim();
}

function removeAnswerLines(lines) {
  return lines.map((line) => {
    if (/^(?:答案|正确答案|参考答案|【答案】|\[答案\])[:：]?/i.test(line)) return "";
    return line.replace(/(?:答案|正确答案|参考答案)[:：]\s*[A-Fa-f,，、\s√×对错正确错误是否]+$/g, "").trim();
  }).filter(Boolean);
}

function extractOptions(text) {
  const optionText = text.replace(/([^\n])([A-Fa-f][.、:])/g, "$1\n$2");
  const optionPattern = /(^|\n|\s)([A-Fa-f])[.、:]\s*/g;
  const allMarkers = [...optionText.matchAll(optionPattern)].map((match) => ({
    letter: match[2].toUpperCase(),
    start: (match.index ?? 0) + match[1].length,
    contentStart: (match.index ?? 0) + match[0].length,
  }));
  const markers = [];
  const seen = new Set();
  for (const marker of allMarkers) {
    if (seen.has(marker.letter)) break;
    markers.push(marker);
    seen.add(marker.letter);
  }

  if (markers.length === 0) {
    return { questionText: optionText.trim(), options: {} };
  }

  const questionText = optionText.slice(0, markers[0].start).trim();
  const options = {};
  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const end = markers[index + 1]?.start ?? optionText.length;
    const value = optionText.slice(marker.contentStart, end).trim().replace(/\n+/g, " ");
    if (value) options[marker.letter] = value;
  }

  return { questionText, options };
}

function extractAnswerFromParentheses(text, typeHint, options) {
  const candidates = [...text.matchAll(/[(（]\s*([^()（）]{1,30})\s*[)）]/g)];
  for (const match of candidates.reverse()) {
    const value = match[1].trim();
    const looksLikeChoice = /^[A-Fa-f](?:\s*[,，、]\s*[A-Fa-f])*$/.test(value);
    const looksLikeJudge = /^(√|×|对|错|正确|错误|是|否|T|F|true|false)$/i.test(value);
    if (looksLikeChoice || looksLikeJudge || typeHint === "blank" || Object.keys(options).length > 0) {
      return { answer: value, raw: match[0], remove: looksLikeChoice || looksLikeJudge };
    }
  }
  return null;
}

function inferType(typeHint, options, answer, questionText) {
  const normalized = normalizeAnswer(answer, "multiple");
  if (Object.keys(options).length > 0) {
    if (typeHint === "multiple" || normalized.length > 1) return "multiple";
    return normalized.length > 1 ? "multiple" : "single";
  }
  if (/^(√|×|对|错|正确|错误|是|否|T|F)$/i.test(String(answer).trim())) return "judge";
  if (typeHint) return typeHint;
  if (/_{2,}|[(（]\s*[)）]|填空/.test(questionText)) return "blank";
  return "short_answer";
}

function normalizeAnswer(value, type) {
  if (!value) return "";
  const cleaned = String(value)
    .replace(/^[:：]/, "")
    .replace(/[。；;]$/g, "")
    .trim();

  if (type === "single" || type === "multiple") {
    const letters = cleaned.match(/[A-Fa-f]/g);
    return letters ? [...new Set(letters.map((letter) => letter.toUpperCase()))].join("") : cleaned;
  }

  if (type === "judge") {
    if (/^(√|对|正确|是|T|TRUE)$/i.test(cleaned)) return "正确";
    if (/^(×|错|错误|否|F|FALSE)$/i.test(cleaned)) return "错误";
  }

  return cleaned;
}
