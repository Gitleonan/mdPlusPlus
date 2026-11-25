import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DiscardConfirmDialog } from './DiscardConfirmDialog';
import {
  resetDiscardConfirmForTests,
  useDiscardConfirmStore,
} from '../../stores/discardConfirmStore';

describe('DiscardConfirmDialog', () => {
  beforeEach(() => {
    resetDiscardConfirmForTests();
  });

  it('renders the in-app confirmation and resolves false on cancel', async () => {
    render(<DiscardConfirmDialog />);
    let answer!: Promise<boolean>;
    act(() => {
      answer = useDiscardConfirmStore
        .getState()
        .ask('放弃未保存的修改？', '「a.md」有未保存的修改，切换后将丢失。', '放弃并切换');
    });

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('「a.md」有未保存的修改，切换后将丢失。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    await expect(answer).resolves.toBe(false);
    expect(useDiscardConfirmStore.getState().request).toBeNull();
  });

  it('resolves true only after the explicit confirm action', async () => {
    render(<DiscardConfirmDialog />);
    let answer!: Promise<boolean>;
    act(() => {
      answer = useDiscardConfirmStore
        .getState()
        .ask('放弃未保存的修改？', '「a.md」有未保存的修改。', '放弃并退出');
    });

    fireEvent.click(await screen.findByRole('button', { name: '放弃并退出' }));

    await expect(answer).resolves.toBe(true);
  });
});
