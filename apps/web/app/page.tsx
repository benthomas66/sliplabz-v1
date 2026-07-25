import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ padding: '2rem' }}>
      <h1>SlipLabz</h1>
      <p><Link href="/board">Go to the Board</Link></p>
    </main>
  );
}
