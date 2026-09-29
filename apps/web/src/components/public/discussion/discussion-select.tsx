'use client';

import { Check, ChevronDown } from 'lucide-react';
import { Select } from 'radix-ui';
import styles from './discussion.module.css';

export interface DiscussionSelectOption<V extends string> { value: V; label: string; description?: string }

export function DiscussionSelect<V extends string>({ value, onChange, options, label, className = '' }: {
  value: V;
  onChange: (value: V) => void;
  options: DiscussionSelectOption<V>[];
  label: string;
  className?: string;
}) {
  return <Select.Root value={value} onValueChange={next => onChange(next as V)}>
    <Select.Trigger className={`${styles.discussionSelectTrigger} ${className}`} aria-label={label}>
      <Select.Value /><Select.Icon><ChevronDown size={16} /></Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Content className={styles.discussionSelectPanel} position="popper" sideOffset={7} collisionPadding={12}>
        <Select.Viewport className={styles.discussionSelectViewport}>
          {options.map(option => <Select.Item key={option.value} value={option.value} className={styles.discussionSelectItem} textValue={option.label}>
            <span><Select.ItemText>{option.label}</Select.ItemText>{option.description && <small>{option.description}</small>}</span>
            <Select.ItemIndicator><Check size={16} /></Select.ItemIndicator>
          </Select.Item>)}
        </Select.Viewport>
      </Select.Content>
    </Select.Portal>
  </Select.Root>;
}
