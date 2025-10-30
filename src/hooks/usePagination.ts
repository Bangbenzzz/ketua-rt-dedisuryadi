// hooks/usePagination.ts
'use client';
import { useEffect, useState } from 'react';

export default function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);
  return { page: currentPage, setPage, total, totalPages, pageItems };
}