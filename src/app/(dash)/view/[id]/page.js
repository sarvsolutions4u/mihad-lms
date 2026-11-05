'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { FileView } from '@/components/FileViewer';

/** A stored file opened from a direct link — shown inside the portal. */
export default function ViewFilePage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  return (
    <FileView
      url={`/api/files/${id}`}
      fullPage
      onClose={() => (window.history.length > 1 ? router.back() : router.push('/dashboard'))}
    />
  );
}
