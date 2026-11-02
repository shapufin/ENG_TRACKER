/**
 * Calendar Refactor Autocheck Script
 * Runs mechanical gate checks on calendar components.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

let errors = 0;

function check(desc, fn) {
  try {
    const result = fn();
    if (result) {
      console.log(`✅ [PASS] ${desc}`);
    } else {
      console.error(`❌ [FAIL] ${desc}`);
      errors++;
    }
  } catch (err) {
    console.error(`❌ [FAIL] ${desc}: ${err.message}`);
    errors++;
  }
}

console.log('\n--- Running Calendar Layout Autocheck ---');

// Check 1: CalendarShell grid layout width contract
const shellPath = path.join(root, 'src/pages/calendar/components/CalendarPageShell.tsx');
if (fs.existsSync(shellPath)) {
  const content = fs.readFileSync(shellPath, 'utf8');
  check('CalendarPageShell exists and has responsive grid configuration', () => {
    return content.includes('grid') && content.includes('CalendarSidebar');
  });
}

// Check 2: CalendarHeader has aria-label on interactive controls
const headerPath = path.join(root, 'src/pages/calendar/components/CalendarHeader.tsx');
if (fs.existsSync(headerPath)) {
  const content = fs.readFileSync(headerPath, 'utf8');
  check('CalendarHeader has aria-label attributes on icon buttons', () => {
    return content.includes('aria-label="Previous month"') && content.includes('aria-label="Next month"');
  });
}

// Check 3: Check that backup member input is not present in CalendarFormDialog
const formDialogPath = path.join(root, 'src/pages/calendar/components/CalendarFormDialog.tsx');
if (fs.existsSync(formDialogPath)) {
  const content = fs.readFileSync(formDialogPath, 'utf8');
  check('CalendarFormDialog adheres to backend contract (no unsanctioned backup_member field)', () => {
    return !content.includes('backupMemberId') && !content.includes('backup_member');
  });
}

// Summary
console.log('----------------------------------------');
if (errors === 0) {
  console.log('🎉 All mechanical calendar checks PASSED!\n');
  process.exit(0);
} else {
  console.error(`⚠️ Found ${errors} autocheck violation(s)!\n`);
  process.exit(1);
}
