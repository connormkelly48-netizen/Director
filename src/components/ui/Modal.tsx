/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose?: () => void;
  dismissible?: boolean;
  showCloseButton?: boolean;
  maxWidthClass?: string;
  borderClass?: string;
  backdropClass?: string;
  panelClass?: string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  children: React.ReactNode;
}

let openModalCount = 0;
let previousBodyOverflow = '';

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  dismissible = true,
  showCloseButton = dismissible,
  maxWidthClass = 'max-w-lg',
  borderClass = 'border-white/10',
  backdropClass = 'bg-[#070a0f]/85',
  panelClass = '',
  header,
  footer,
  ariaLabel,
  ariaLabelledBy,
  children,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  // Lock body scroll while open (supports nested/sequential modals cleanly)
  useEffect(() => {
    if (!isOpen) return;

    if (openModalCount === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    openModalCount += 1;

    return () => {
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) {
        document.body.style.overflow = previousBodyOverflow;
      }
    };
  }, [isOpen]);

  // Focus dialog on open & restore on close
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const timer = window.setTimeout(() => {
      if (panelRef.current) {
        const focusable = panelRef.current.querySelector<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable) {
          focusable.focus({ preventScroll: true });
        } else {
          panelRef.current.focus({ preventScroll: true });
        }
      }
    }, 10);

    return () => {
      window.clearTimeout(timer);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function' && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [isOpen]);

  // Escape key dismissal
  useEffect(() => {
    if (!isOpen || !dismissible || !onClose) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, dismissible, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && dismissible && onClose) {
      onClose();
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      className={`fixed inset-0 z-50 ${backdropClass} max-md:backdrop-blur-none md:backdrop-blur-md flex items-end sm:items-center justify-center safe-area-modal-backdrop`}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
        className={`w-full ${maxWidthClass} bg-[#111827] border ${borderClass} rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[100dvh] sm:max-h-[90dvh] flex flex-col overflow-hidden outline-none animate-in fade-in zoom-in-95 duration-150 ${panelClass}`}
      >
        {/* Sticky Header */}
        {(header || (showCloseButton && onClose)) && (
          <div className="shrink-0 px-4 sm:px-6 pt-4 sm:pt-5 pb-3.5 border-b border-white/10 bg-[#111827] flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">{header}</div>
            {showCloseButton && onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="min-h-11 min-w-11 -mr-2 -mt-1.5 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 sm:py-5">
          {children}
        </div>

        {/* Sticky Footer */}
        {footer && (
          <div className="shrink-0 px-4 sm:px-6 pt-3.5 safe-area-modal-footer sm:pb-5 border-t border-white/10 bg-[#111827]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
