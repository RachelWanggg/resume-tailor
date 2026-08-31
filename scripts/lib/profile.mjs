/**
 * profile.mjs — loads profile/profile.yaml and turns it into an answer bank.
 *
 * The regex patterns that recognize an application question are generic and live in the apply
 * scripts. The *values* are the operator's and live in profile/profile.yaml. This module is the
 * seam between them.
 *
 * profile.yaml is written in JSON syntax (which is valid YAML 1.2) so it parses with no
 * dependencies in both Node and Python. Keys beginning with `_` are documentation and are ignored.
 *
 * Nothing here ever invents an answer. A required field left null raises, naming every field still
 * missing, so the operator fixes it once instead of discovering it mid-application.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROFILE_PATH = path.join(REPO_ROOT, 'profile', 'profile.yaml');

export class ProfileError extends Error {}

/** Expand a leading ~ to the user's home directory. */
export function expandHome(p) {
  if (typeof p !== 'string') return p;
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

/**
 * Read and validate profile/profile.yaml.
 * @returns {object} the parsed profile
 * @throws {ProfileError} when the file is missing, malformed, or has unset required fields
 */
export function loadProfile(profilePath = PROFILE_PATH) {
  if (!existsSync(profilePath)) {
    throw new ProfileError(
      `No profile found at ${profilePath}\n` +
      `Create one by copying the example and filling it in:\n` +
      `    cp -r profile.example profile\n` +
      `Then edit profile/profile.yaml. See the README section "Create Your Profile".`
    );
  }

  let profile;
  try {
    profile = JSON.parse(readFileSync(profilePath, 'utf8'));
  } catch (err) {
    throw new ProfileError(
      `Could not parse ${profilePath}: ${err.message}\n` +
      `The file uses JSON syntax. A trailing comma or a missing quote is the usual cause.`
    );
  }

  // Required fields, as dotted paths. Null or undefined means the operator has not decided yet,
  // and we must not decide for them — these carry legal weight.
  const REQUIRED = [
    'identity.full_name',
    'identity.email',
    'identity.phone',
    'work_authorization.authorized_to_work_us',
    'work_authorization.requires_sponsorship',
    'work_authorization.us_citizen_or_permanent_resident',
  ];

  const missing = REQUIRED.filter((p) => get(profile, p) === null || get(profile, p) === undefined);
  if (missing.length) {
    throw new ProfileError(
      `profile/profile.yaml is missing required values:\n` +
      missing.map((m) => `    ${m}`).join('\n') +
      `\nThese affect application eligibility, so they are never guessed for you. ` +
      `Fill them in and re-run.`
    );
  }

  if (profile.identity.full_name === 'Jordan Rivera') {
    throw new ProfileError(
      `profile/profile.yaml still contains the example persona (Jordan Rivera).\n` +
      `Replace it with your own details before applying to anything.`
    );
  }

  return profile;
}

/** Read a dotted path out of an object, returning undefined rather than throwing. */
function get(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

const yn = (b) => (b ? 'Yes' : 'No');

/**
 * Build the value map the apply scripts fill their answer bank from.
 *
 * Values that are null stay null. A null value means "the operator declined to supply this", and
 * the caller must treat the question as unanswerable — stopping to ask rather than guessing.
 */
export function answerValues(profile) {
  const id = profile.identity ?? {};
  const auth = profile.work_authorization ?? {};
  const prefs = profile.preferences ?? {};
  const edu = profile.education ?? {};
  const comp = profile.compensation ?? {};
  const screen = profile.screening ?? {};
  const eeo = profile.eeo ?? {};

  return {
    // Identity
    fullName: id.full_name ?? null,
    firstName: id.first_name ?? null,
    lastName: id.last_name ?? null,
    email: id.email ?? null,
    phone: id.phone ? String(id.phone).replace(/\D/g, '') : null,
    city: id.city ?? null,
    state: id.state ?? null,
    linkedinUrl: id.linkedin_url ?? null,
    githubUrl: id.github_url ?? null,
    website: id.website ?? null,

    // Work authorization — the answers that matter most and are guessed least
    authorizedToWork: auth.authorized_to_work_us == null ? null : yn(auth.authorized_to_work_us),
    requiresSponsorship: auth.requires_sponsorship == null ? null : yn(auth.requires_sponsorship),
    usCitizenOrPr:
      auth.us_citizen_or_permanent_resident == null
        ? null
        : yn(auth.us_citizen_or_permanent_resident),
    hasSecurityClearance: auth.has_security_clearance == null ? null : yn(auth.has_security_clearance),

    // Preferences
    willingToRelocate: prefs.willing_to_relocate == null ? null : yn(prefs.willing_to_relocate),
    yearsOfExperience: prefs.years_of_experience == null ? null : String(prefs.years_of_experience),
    jobPreference: prefs.job_preference_statement ?? null,
    howDidYouHear: prefs.how_did_you_hear_about_us ?? null,

    // Education
    gpa: edu.gpa == null ? null : String(edu.gpa),
    graduationDate: edu.graduation_date ? formatGraduation(edu.graduation_date) : null,
    highestDegree: edu.highest_degree ?? null,

    // Derived, so the operator does not have to state them twice.
    hasBachelors: edu.highest_degree == null ? null : yn(holdsBachelorsOrHigher(edu.highest_degree)),
    currentlyEnrolled:
      edu.graduation_date == null ? null : yn(isFutureMonth(edu.graduation_date)),

    // Compensation
    salary: comp.salary_expectation == null ? null : String(comp.salary_expectation),

    // Screening
    backgroundCheck: screen.willing_background_check == null ? null : yn(screen.willing_background_check),
    drugTest: screen.willing_drug_test == null ? null : yn(screen.willing_drug_test),

    // EEO — every one may legitimately be null, meaning "decline to self-identify"
    gender: eeo.gender ?? null,
    raceEthnicity: eeo.race_ethnicity ?? null,
    veteranStatus: eeo.veteran_status ?? null,
    disabilityStatus: eeo.disability_status ?? null,
  };
}

/** True when the stated highest degree is a bachelor's or above. */
function holdsBachelorsOrHigher(degree) {
  return /bachelor|b\.?s\.?|b\.?a\.?|master|m\.?s\.?|mba|ph\.?d|doctor/i.test(String(degree));
}

/** True when a YYYY-MM graduation date has not yet passed — i.e. still enrolled. */
function isFutureMonth(iso) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(iso));
  if (!m) return false;
  const grad = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  const now = new Date();
  return grad > new Date(now.getFullYear(), now.getMonth(), 1);
}

/** "2026-06" → "June 2026". Application forms want a human-readable month. */
function formatGraduation(iso) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(iso));
  if (!m) return String(iso);
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  const idx = parseInt(m[2], 10) - 1;
  return months[idx] ? `${months[idx]} ${m[1]}` : String(iso);
}

/** Company blocklist as a case-insensitive regex, or null when the list is empty. */
export function blocklistRegex(profile) {
  const list = (profile.blocklist ?? []).filter(Boolean);
  if (!list.length) return null;
  const escaped = list.map((s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(escaped.join('|'), 'i');
}

/** Browser settings for one platform, with ~ expanded and defaults applied. */
export function browserConfig(profile, platform, defaultPort) {
  const cfg = profile.browser?.[platform] ?? {};
  return {
    profileDir: expandHome(cfg.chrome_profile_dir ?? `~/.config/${platform}-chrome-profile`),
    port: cfg.debug_port ?? defaultPort,
  };
}

/** Absolute path to the outputs directory, resolved from the repo root. */
export function outputsDir(profile) {
  return path.resolve(REPO_ROOT, profile.output?.resume_dir ?? 'outputs');
}

/** Absolute path to the applied-jobs log, resolved from the repo root. */
export function appliedLogPath(profile) {
  return path.resolve(REPO_ROOT, profile.output?.applied_log ?? 'applied_jobs.txt');
}

export { REPO_ROOT, PROFILE_PATH };
