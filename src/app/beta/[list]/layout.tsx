import { notFound } from 'next/navigation';

import BetaNav from '@/components/beta/BetaNav';
import { parseListKind } from '@/lib/listKind';

export default function BetaListLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: { list: string };
}) {
  const list = parseListKind(params.list);
  if (!list) {
    notFound();
  }

  return (
    <>
      <BetaNav list={list} />
      {children}
    </>
  );
}
