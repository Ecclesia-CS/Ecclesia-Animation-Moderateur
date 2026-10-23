import { useEffect, useState } from 'react'
import { listUnaddressedTopicsAdmin, type UnaddressedTopic } from '../lib/tableTopics'
import { extractErr } from '../lib/utils'

// Chantier 173 — sujets proposés ou ajoutés à une table et jamais traités. Ils survivent
// à la sortie du débat (les files, elles, sont vidées). Lecture via check_session_admin,
// donc ouverte aux associations comme au superadmin.
export default function UnaddressedTopicsPanel({ sessionId, getPwd }: {
  sessionId: string
  getPwd: () => string | null
}) {
  const [topics, setTopics] = useState<UnaddressedTopic[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let off = false
    const pwd = getPwd()
    if (!pwd) return
    listUnaddressedTopicsAdmin(pwd, sessionId)
      .then(r => { if (!off) setTopics(r) })
      .catch(e => { if (!off) setErr(extractErr(e)) })
    return () => { off = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  if (err) return <p className="text-xs text-red-600">{err}</p>

  const byTable = new Map<string, UnaddressedTopic[]>()
  for (const t of topics ?? []) byTable.set(t.table_id, [...(byTable.get(t.table_id) ?? []), t])

  return (
    <div className="flex flex-col gap-2 pt-2 border-t border-bleu-fonce/10">
      <span className="text-xs font-medium text-gray-500">Sujets non abordés</span>
      {topics === null ? (
        <p className="text-xs text-gray-600">Chargement…</p>
      ) : topics.length === 0 ? (
        <p className="text-xs text-gray-600">Aucun sujet en attente.</p>
      ) : (
        Array.from(byTable.values()).map(list => (
          <div key={list[0].table_id}>
            {list[0].table_number != null && (
              <p className="text-xs font-semibold text-bleu-fonce/80">Table {list[0].table_number}</p>
            )}
            <ul className="list-disc pl-5 text-sm text-gray-800">
              {list.map(t => <li key={t.id}>{t.texte}</li>)}
            </ul>
          </div>
        ))
      )}
    </div>
  )
}
