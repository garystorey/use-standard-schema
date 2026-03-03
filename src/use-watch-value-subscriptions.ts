import type { RefObject } from "react"
import { useEffect } from "react"
import type { FormValues, FormWatchEntry } from "./types"

function useWatchValueSubscriptions(
	data: FormValues,
	watchEntriesRef: RefObject<Set<FormWatchEntry>>,
	previousDataRef: RefObject<FormValues>,
): void {
	useEffect(() => {
		const prev = previousDataRef.current
		if (Object.is(prev, data)) return

		previousDataRef.current = data
		if (watchEntriesRef.current.size === 0) return

		const entries = [...watchEntriesRef.current]

		const notifyEntry = (entry: FormWatchEntry): void => {
			const { fields } = entry

			if (!fields?.length) {
				entry.callback(data)
				return
			}

			const relevantChange = fields.some((field) => (prev[field] ?? "") !== (data[field] ?? ""))
			if (!relevantChange) return

			const selection: FormValues = {}
			for (const field of fields) {
				selection[field] = data[field] ?? ""
			}
			entry.callback(selection)
		}

		for (const entry of entries) {
			notifyEntry(entry)
		}
	}, [data, previousDataRef, watchEntriesRef])
}

export { useWatchValueSubscriptions }
