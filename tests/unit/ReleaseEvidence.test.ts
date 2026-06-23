import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

function createEvidenceDirectory(complete: boolean): string {
  const directory = mkdtempSync(join(tmpdir(), 'memory-seams-evidence-'));
  temporaryDirectories.push(directory);

  const playtestHeader =
    'participant_id,consent,first_time,age_band,build_commit,started_at,finished_at,duration_minutes,completed,external_help,home_hint_level,rain_hint_level,life_hint_level,return_hint_level,d3_first_junction_attempts,settings_blocked,q1_cured,q2_diagnostic,q3_support_action,q4_dehumanizing,q5_ending_meaning,theme_understood,unresolved_adverse_event,notes';
  const playtests = complete
    ? Array.from({ length: 15 }, (_, index) =>
        [
          `P${String(index + 1).padStart(2, '0')}`,
          'yes',
          'yes',
          index < 3 ? '45_plus' : '18_44',
          'abc123',
          '2026-06-23T10:00:00+08:00',
          '2026-06-23T10:25:00+08:00',
          '25',
          'yes',
          'no',
          '0',
          '0',
          '0',
          '0',
          '1',
          'no',
          'no',
          'no',
          '耐心沟通',
          'no',
          '陪伴仍有价值',
          'yes',
          'no',
          '',
        ].join(','),
      )
    : [];
  writeFileSync(
    join(directory, 'playtest-sessions.csv'),
    [playtestHeader, ...playtests].join('\n'),
  );

  const accessibilityHeader =
    'check_id,tester_id,track,browser,os,build_commit,completed,blocker_id,checked_at,notes';
  const tracks = [
    'keyboard_only',
    'muted',
    'color_redundancy',
    'low_stimulation',
    'reduced_motion',
    'zoom_200',
    'screen_reader',
  ];
  const accessibility = complete
    ? tracks.map(
        (track, index) => `A${index + 1},T01,${track},chrome,windows,abc123,yes,,2026-06-23,`,
      )
    : [];
  writeFileSync(
    join(directory, 'accessibility-checks.csv'),
    [accessibilityHeader, ...accessibility].join('\n'),
  );

  const browserHeader =
    'check_id,tester_id,browser,browser_version,os,viewport,build_commit,status,blocker_id,checked_at,notes';
  const browsers = complete
    ? [
        'B1,T01,chrome,1,windows,1366x768,abc123,pass,,2026-06-23,',
        'B2,T01,edge,1,windows,1366x768,abc123,pass,,2026-06-23,',
        'B3,T01,firefox,1,windows,1366x768,abc123,pass,,2026-06-23,',
        'B4,T02,safari_desktop,1,macos,1366x768,abc123,pass,,2026-06-23,',
      ]
    : [];
  writeFileSync(join(directory, 'browser-checks.csv'), [browserHeader, ...browsers].join('\n'));

  const reviewHeader =
    'review_id,review_type,reviewer_id,qualification,scope,reviewed_at,conclusion,blocking_open,high_open,consent_to_credit,evidence_reference,notes';
  const reviews = complete
    ? [
        'R1,medical,M01,neurology,medical copy,2026-06-23,approved,0,0,no,private-review-1,',
        'R2,sensitivity,S01,caregiver,story,2026-06-23,approved,0,0,no,private-review-2,',
      ]
    : [];
  writeFileSync(join(directory, 'external-reviews.csv'), [reviewHeader, ...reviews].join('\n'));

  const decisionHeader = 'decision,value,owner_id,decided_at,evidence_reference,notes';
  const decisions = complete
    ? [
        'voice_scope,subtitle_only_accepted,O01,2026-06-23,decision-1,',
        'project_license,all_rights_reserved,O01,2026-06-23,decision-2,',
        'asset_rights,cleared,O01,2026-06-23,decision-3,',
      ]
    : [];
  writeFileSync(
    join(directory, 'release-decisions.csv'),
    [decisionHeader, ...decisions].join('\n'),
  );
  return directory;
}

function runSummary(directory: string) {
  return spawnSync(
    process.execPath,
    [join(process.cwd(), 'scripts', 'summarize_release_evidence.mjs'), directory],
    { cwd: process.cwd(), encoding: 'utf8' },
  );
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe('release evidence summary', () => {
  it('passes only when every external release gate has evidence', () => {
    const result = runSummary(createEvidenceDirectory(true));

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('> 结论：PASS');
    expect(result.stdout).not.toContain('| FAIL |');
  });

  it('rejects header-only templates as incomplete evidence', () => {
    const result = runSummary(createEvidenceDirectory(false));

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('> 结论：INCOMPLETE');
    expect(result.stdout).toContain('| FAIL |');
  });

  it('rejects duplicated participant identities', () => {
    const directory = createEvidenceDirectory(true);
    const path = join(directory, 'playtest-sessions.csv');
    writeFileSync(path, readFileSync(path, 'utf8').replace('P15,yes', 'P01,yes'));

    const result = runSummary(directory);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('| 参与者 ID 唯一且非空 | FAIL |');
  });
});
