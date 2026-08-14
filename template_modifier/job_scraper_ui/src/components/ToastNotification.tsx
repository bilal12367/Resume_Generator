import React from 'react';

export interface ToastData {
  message: string;
  jobId?: string;
  type?: 'success' | 'error' | 'info';
}

interface ToastNotificationProps {
  toast: ToastData | null;
  onClose: () => void;
  onOpenJobModal: (jobId: string) => void;
}

export const ToastNotification: React.FC<ToastNotificationProps> = ({
  toast,
  onClose,
  onOpenJobModal,
}) => {
  if (!toast) return null;

  const isSuccess = toast.type === 'success';
  const isError = toast.type === 'error';
  const bgGradient = isSuccess
    ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
    : isError
    ? 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)'
    : 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)';
  const borderStyle = isSuccess ? '1px solid #34d399' : isError ? '1px solid #fca5a5' : '1px solid #a78bfa';
  const shadowStyle = isSuccess
    ? '0 10px 30px rgba(16, 185, 129, 0.45)'
    : isError
    ? '0 10px 30px rgba(239, 68, 68, 0.45)'
    : '0 10px 30px rgba(139, 92, 246, 0.45)';
  const icon = isSuccess ? '🎉' : isError ? '⚠️' : '🔔';

  return (
    <div
      style={{
        position: 'fixed',
        top: '1.2rem',
        right: '1.5rem',
        zIndex: 10000,
        background: bgGradient,
        border: borderStyle,
        boxShadow: shadowStyle,
        color: '#ffffff',
        padding: '0.85rem 1.3rem',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '0.8rem',
        maxWidth: '450px',
        animation: 'slideIn 0.3s ease-out',
      }}
    >
      <span style={{ fontSize: '1.25rem' }}>{icon}</span>
      <span style={{ fontSize: '0.85rem', fontWeight: 600, lineHeight: '1.4', flex: 1 }}>
        {toast.message}
      </span>
      {toast.jobId && (
        <button
          onClick={() => {
            onOpenJobModal(toast.jobId!);
            onClose();
          }}
          style={{
            background: '#ffffff',
            color: isSuccess ? '#059669' : isError ? '#dc2626' : '#6366f1',
            border: 'none',
            padding: '0.35rem 0.75rem',
            borderRadius: '6px',
            fontWeight: 700,
            fontSize: '0.78rem',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Explore Description 📖
        </button>
      )}
      <button
        onClick={onClose}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'rgba(255,255,255,0.8)',
          fontSize: '1.1rem',
          cursor: 'pointer',
          marginLeft: '0.2rem',
        }}
      >
        ✕
      </button>
    </div>
  );
};
