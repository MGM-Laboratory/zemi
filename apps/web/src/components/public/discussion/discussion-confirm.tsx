'use client';

import { ArrowRight, X } from 'lucide-react';
import { AlertDialog } from 'radix-ui';
import { useState } from 'react';
import styles from './discussion.module.css';

export function DiscussionConfirm({ open, onOpenChange, title, description, action, onConfirm, destructive = true }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  action: string;
  onConfirm: () => Promise<void>;
  destructive?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try { await onConfirm(); onOpenChange(false); }
    catch { /* The caller announces the error and keeps the dialog open. */ }
    finally { setBusy(false); }
  };
  return <AlertDialog.Root open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
    <AlertDialog.Portal>
      <AlertDialog.Overlay className={styles.confirmOverlay} />
      <AlertDialog.Content className={styles.confirmPanel}>
        <div className={styles.confirmArt} aria-hidden="true"><span>?</span><i>LET&apos;S BE SURE</i></div>
        <div className={styles.confirmCopy}><AlertDialog.Title>{title}</AlertDialog.Title><AlertDialog.Description>{description}</AlertDialog.Description></div>
        <div className={styles.confirmActions}>
          <AlertDialog.Cancel asChild><button type="button" disabled={busy} className={styles.confirmCancel}><X size={16} /> Keep it</button></AlertDialog.Cancel>
          <button type="button" disabled={busy} onClick={() => { void confirm(); }} className={destructive ? styles.confirmDestructive : styles.confirmAction}>{busy ? 'Working...' : action}<ArrowRight size={17} /></button>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>;
}
