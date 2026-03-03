import { type MutableRefObject, useEffect } from "react"
import type { FormValues, FormWatchEntry } from "./types"

function useWatchValueSubscriptions(
	data: FormValues,
	watchEntriesRef: MutableRefObject<Set<FormWatchEntry>>,
	previousDataRef: MutableRefObject<FormValues>,
): void {
	useEffect(() => {
		const prev = previousDataRef.current
		if (Object.is(prev, data)) return

		previousDataRef.current = data
		if (watchEntriesRef.current.size === 0) return

		const entries = [...watchEntriesRef.current]
		const prevMap = new Map(Object.entries(prev))

		for (const entry of entries) {
			const { fields } = entry
			if (fields && fields.length > 0) {
				const relevantChange = fields.some((field) => (prevMap.get(field) ?? "") !== (data[field] ?? ""))
				if (!relevantChange) continue

				const selection: FormValues = {}
				for (const field of fields) {
					selection[field] = data[field] ?? ""
				}
				entry.callback(selection)
				continue
			}

			entry.callback(data)
		}
	}, [data])
}

export { useWatchValueSubscriptions }
