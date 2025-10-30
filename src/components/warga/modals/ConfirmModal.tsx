'use client';
import React from 'react';
import Modal from '@/components/common/Modal';

export default function ConfirmModal({ title, message, onCancel, onConfirm }: { title: string; message: string; onCancel: () => void; onConfirm: () => void; }) {
  return (
    <Modal onClose={onCancel} title={title} width={420}>
      <p style={{ margin: 0, color: '#e5e7eb', lineHeight: 1.6 }}>{message}</p>
      <footer className="modalFoot">
        <button type="button" className="btn" onClick={onCancel}>Batal</button>
        <button type="button" className="btn danger" onClick={onConfirm}>Ya, Hapus</button>
      </footer>
      <style jsx>{`
        .modalFoot { 
          margin-top: 20px; 
          padding-top: 16px; 
          border-top: 1px solid rgba(255,255,255,.1); 
          display: flex; 
          justify-content: flex-end; 
          gap: 10px; 
        }
        .btn {
            background: rgba(255,255,255,.08); color: #e5e7eb; border: 1px solid rgba(255,255,255,.12);
            padding: 8px 12px; border-radius: 8px; font-weight: 500;
        }
        .btn.danger { 
            background: #ef4444; color: white; border: none; font-weight: 600;
        }
      `}</style>
    </Modal>
  );
}