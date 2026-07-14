// Loads and normalizes emojibase-data on demand. Kept out of the SFC so
// the (heavy) JSON import is a separate chunk that Vite can lazy-load
// the first time the picker opens.

export interface EmojiCompactEntry {
    hexcode: string
    label: string
    unicode: string
    order?: number
    /**
     * Group index (0-9), mapped via meta/groups.json:
     * 0=smileys-emotion, 1=people-body, 2=component (skin/hair),
     * 3=animals-nature, 4=food-drink, 5=travel-places, 6=activities,
     * 7=objects, 8=symbols, 9=flags.
     * Entries WITHOUT a group are pure skin-tone / hair-style
     * components and are filtered out.
     */
    group?: number
    tags?: string[]
    emoticon?: string | string[]
    skins?: EmojiCompactEntry[]
}

export interface EmojiGroup {
    id: number
    key: string
    label: string
    /** Emoji shown on the group tab (usually the first entry in the group). */
    representative: string
    emojis: EmojiCompactEntry[]
}

export interface EmojiDataset {
    all: EmojiCompactEntry[]
    groups: EmojiGroup[]
}

const SKIP_GROUPS = new Set<number>([ 2 ]) // component (skin-tone / hair-style) — not useful as reactions

let cachedDataset: EmojiDataset | null = null
let inflight: Promise<EmojiDataset> | null = null

export function loadEmojiDataset (): Promise<EmojiDataset> {
    if (cachedDataset) return Promise.resolve(cachedDataset)
    if (inflight) return inflight

    inflight = Promise.all([
        import('emojibase-data/en/compact.json') as Promise<{ default: EmojiCompactEntry[] }>,
        import('emojibase-data/meta/groups.json') as Promise<{ default: { groups: Record<string, string> } }>,
        import('emojibase-data/en/messages.json') as Promise<{ default: { groups: Array<{ key: string, message: string, order: number }> } }>
    ]).then(([ compactMod, groupsMod, messagesMod ]) => {
        const compact = compactMod.default
        const groupIdToKey = groupsMod.default.groups
        const groupKeyToLabel: Record<string, string> = {}
        messagesMod.default.groups.forEach((g) => {
            groupKeyToLabel[g.key] = g.message
        })

        const all = compact.filter((e) => e.group !== undefined && !SKIP_GROUPS.has(e.group))

        const byGroup = new Map<number, EmojiCompactEntry[]>()
        all.forEach((e) => {
            const gid = e.group as number
            if (!byGroup.has(gid)) byGroup.set(gid, [])
            byGroup.get(gid)!.push(e)
        })

        const groups: EmojiGroup[] = []
        Object.entries(groupIdToKey).forEach(([ idStr, key ]) => {
            const id = Number(idStr)
            if (SKIP_GROUPS.has(id)) return
            const emojis = (byGroup.get(id) ?? []).sort(
                (a, b) => (a.order ?? 0) - (b.order ?? 0)
            )
            if (emojis.length === 0) return
            groups.push({
                id,
                key,
                label: groupKeyToLabel[key] ?? key,
                representative: emojis[0].unicode,
                emojis
            })
        })

        cachedDataset = { all, groups }
        return cachedDataset
    }).finally(() => {
        inflight = null
    })

    return inflight
}

/** Fuzzy-ish search over label + tags. Case-insensitive, whitespace-tolerant. */
export function searchEmojis (dataset: EmojiDataset, query: string, limit = 200): EmojiCompactEntry[] {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return []
    const terms = trimmed.split(/\s+/).filter(Boolean)
    if (terms.length === 0) return []

    const results: EmojiCompactEntry[] = []
    for (const emoji of dataset.all) {
        const haystack = [ emoji.label, ...(emoji.tags ?? []) ].join(' ').toLowerCase()
        if (terms.every((term) => haystack.includes(term))) {
            results.push(emoji)
            if (results.length >= limit) break
        }
    }
    return results
}
