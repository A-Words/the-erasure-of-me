import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_FILES = [
  'playtest-sessions.csv',
  'accessibility-checks.csv',
  'browser-checks.csv',
  'external-reviews.csv',
  'release-decisions.csv',
];

const REQUIRED_ACCESSIBILITY_TRACKS = [
  'keyboard_only',
  'muted',
  'color_redundancy',
  'low_stimulation',
  'reduced_motion',
  'zoom_200',
  'screen_reader',
];

const REQUIRED_BROWSERS = ['chrome', 'edge', 'firefox', 'safari_desktop'];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field.trim());
      field = '';
    } else if (character === '\n') {
      row.push(field.trim());
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else if (character !== '\r') {
      field += character;
    }
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field');
  row.push(field.trim());
  if (row.some((value) => value !== '')) rows.push(row);
  return rows;
}

function readRecords(directory, filename) {
  const path = resolve(directory, filename);
  if (!existsSync(path)) throw new Error(`Missing required evidence file: ${filename}`);
  const rows = parseCsv(readFileSync(path, 'utf8'));
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map((values, rowIndex) => {
    if (values.length !== headers.length)
      throw new Error(
        `${filename} row ${rowIndex + 2} has ${values.length} columns; expected ${headers.length}`,
      );
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

function normalized(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function isYes(value) {
  return ['yes', 'true', '1'].includes(normalized(value));
}

function percent(numerator, denominator) {
  return denominator === 0 ? 0 : (numerator / denominator) * 100;
}

function percentText(value) {
  return `${value.toFixed(1)}%`;
}

function gate(name, passed, evidence) {
  return { name, passed, evidence };
}

function evaluatePlaytests(records) {
  const eligible = records.filter((record) => isYes(record.consent) && isYes(record.first_time));
  const count = eligible.length;
  const participantIds = eligible.map((record) => normalized(record.participant_id));
  const uniqueParticipantIds = new Set(participantIds.filter(Boolean));
  const buildCommits = new Set(
    eligible.map((record) => normalized(record.build_commit)).filter(Boolean),
  );
  const olderParticipants = eligible.filter(
    (record) => normalized(record.age_band) === '45_plus',
  ).length;
  const timely = eligible.filter((record) => {
    const duration = Number(record.duration_minutes);
    return (
      isYes(record.completed) && !isYes(record.external_help) && duration >= 20 && duration <= 30
    );
  }).length;
  const timelyRate = percent(timely, count);
  const hintColumns = [
    'home_hint_level',
    'rain_hint_level',
    'life_hint_level',
    'return_hint_level',
  ];
  const hintRates = Object.fromEntries(
    hintColumns.map((column) => [
      column,
      percent(eligible.filter((record) => Number(record[column]) >= 3).length, count),
    ]),
  );
  const d3Rate = percent(
    eligible.filter((record) => {
      const attempts = Number(record.d3_first_junction_attempts);
      return Number.isFinite(attempts) && attempts > 0 && attempts <= 2;
    }).length,
    count,
  );
  const themeRate = percent(
    eligible.filter((record) => isYes(record.theme_understood)).length,
    count,
  );
  const settingsBlocked = eligible.filter((record) => isYes(record.settings_blocked)).length;
  const diagnosticMisread = eligible.filter(
    (record) => normalized(record.q2_diagnostic) !== 'no',
  ).length;
  const adverseEvents = eligible.filter((record) => isYes(record.unresolved_adverse_event)).length;

  return [
    gate('至少 15 名合格首次玩家', count >= 15, `${count} 人`),
    gate(
      '参与者 ID 唯一且非空',
      count >= 15 && uniqueParticipantIds.size === count,
      `${uniqueParticipantIds.size}/${count} 个唯一 ID`,
    ),
    gate('包含 45 岁以上家庭成员', count >= 15 && olderParticipants > 0, `${olderParticipants} 人`),
    gate(
      '使用同一个已记录候选构建',
      count >= 15 && buildCommits.size === 1,
      `${buildCommits.size} 个构建`,
    ),
    gate(
      '20–30 分钟内无攻略完成率 ≥ 80%',
      count >= 15 && timelyRate >= 80,
      `${timely}/${count}，${percentText(timelyRate)}`,
    ),
    ...hintColumns.map((column) =>
      gate(
        `${column} 三级提示率 ≤ 30%`,
        count >= 15 && hintRates[column] <= 30,
        percentText(hintRates[column]),
      ),
    ),
    gate('D3 首个路口两次内通过率 ≥ 80%', count >= 15 && d3Rate >= 80, percentText(d3Rate)),
    gate('主题理解率 ≥ 80%', count >= 15 && themeRate >= 80, percentText(themeRate)),
    gate('没有玩家被设置层阻塞', count >= 15 && settingsBlocked === 0, `${settingsBlocked} 人`),
    gate(
      '没有玩家把谜题理解为诊断工具',
      count >= 15 && diagnosticMisread === 0,
      `${diagnosticMisread} 人`,
    ),
    gate('没有未处理的严重不良事件', count >= 15 && adverseEvents === 0, `${adverseEvents} 人`),
  ];
}

function evaluateAccessibility(records) {
  return REQUIRED_ACCESSIBILITY_TRACKS.map((track) => {
    const checks = records.filter((record) => normalized(record.track) === track);
    const passed = checks.some(
      (record) =>
        isYes(record.completed) &&
        normalized(record.blocker_id) === '' &&
        normalized(record.build_commit) !== '',
    );
    return gate(`无障碍路径：${track}`, passed, `${checks.length} 条记录`);
  });
}

function evaluateBrowsers(records) {
  return REQUIRED_BROWSERS.map((browser) => {
    const checks = records.filter((record) => normalized(record.browser) === browser);
    const passed = checks.some(
      (record) =>
        normalized(record.status) === 'pass' &&
        normalized(record.blocker_id) === '' &&
        normalized(record.browser_version) !== '' &&
        normalized(record.os) !== '' &&
        normalized(record.build_commit) !== '' &&
        (browser !== 'safari_desktop' || normalized(record.os).startsWith('macos')),
    );
    return gate(`浏览器：${browser}`, passed, `${checks.length} 条记录`);
  });
}

function evaluateReviews(records) {
  return ['medical', 'sensitivity'].map((reviewType) => {
    const reviews = records.filter((record) => normalized(record.review_type) === reviewType);
    const passed = reviews.some(
      (record) =>
        normalized(record.qualification) !== '' &&
        normalized(record.conclusion) === 'approved' &&
        Number(record.blocking_open) === 0 &&
        Number(record.high_open) === 0 &&
        normalized(record.evidence_reference) !== '',
    );
    return gate(`外部审核：${reviewType}`, passed, `${reviews.length} 条记录`);
  });
}

function evaluateDecisions(records) {
  const accepted = {
    voice_scope: ['recorded', 'subtitle_only_accepted'],
    project_license: [],
    asset_rights: ['cleared'],
  };
  return Object.entries(accepted).map(([decision, values]) => {
    const matches = records.filter((record) => normalized(record.decision) === decision);
    const passed = matches.some((record) => {
      const value = normalized(record.value);
      const valueAccepted =
        values.length === 0 ? value !== '' && value !== 'pending' : values.includes(value);
      return (
        valueAccepted &&
        normalized(record.owner_id) !== '' &&
        normalized(record.decided_at) !== '' &&
        normalized(record.evidence_reference) !== ''
      );
    });
    return gate(`发布决定：${decision}`, passed, `${matches.length} 条记录`);
  });
}

export function summarizeEvidence(directory) {
  const data = Object.fromEntries(
    REQUIRED_FILES.map((filename) => [filename, readRecords(directory, filename)]),
  );
  const gates = [
    ...evaluatePlaytests(data['playtest-sessions.csv']),
    ...evaluateAccessibility(data['accessibility-checks.csv']),
    ...evaluateBrowsers(data['browser-checks.csv']),
    ...evaluateReviews(data['external-reviews.csv']),
    ...evaluateDecisions(data['release-decisions.csv']),
  ];
  const passed = gates.every((item) => item.passed);
  const lines = [
    '# v0.1 外部发布证据汇总',
    '',
    `> 生成时间：${new Date().toISOString()}`,
    `> 结论：${passed ? 'PASS' : 'INCOMPLETE'}`,
    '',
    '| 门槛 | 状态 | 证据 |',
    '| --- | --- | --- |',
    ...gates.map(
      (item) => `| ${item.name} | ${item.passed ? 'PASS' : 'FAIL'} | ${item.evidence} |`,
    ),
    '',
    passed
      ? '所有机器可判定门槛均已通过；发布负责人仍需核对原始记录、签署材料和证据引用。'
      : '至少一个门槛未通过或证据不足。不得将该版本标记为正式完成或发布。',
    '',
  ];
  return { passed, gates, markdown: lines.join('\n') };
}

function parseArguments(arguments_) {
  const directory = arguments_[0];
  const outputIndex = arguments_.indexOf('--output');
  const output = outputIndex >= 0 ? arguments_[outputIndex + 1] : null;
  if (!directory || (outputIndex >= 0 && !output)) {
    throw new Error(
      'Usage: node scripts/summarize_release_evidence.mjs <evidence-directory> [--output <report.md>]',
    );
  }
  return { directory, output };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const { directory, output } = parseArguments(process.argv.slice(2));
    const result = summarizeEvidence(directory);
    if (output) writeFileSync(resolve(output), result.markdown, 'utf8');
    process.stdout.write(result.markdown);
    process.exitCode = result.passed ? 0 : 2;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
