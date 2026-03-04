import type { RefObject } from "react"
import { useEffect } from "react"
import type { FormValues, FormWatchEntry } from "./types"

function hasRelevantChange(fields: readonly string[], previous: FormValues, current: FormValues): boolean {
	for (const field of fields) {
		if ((previous[field] ?? "") !== (current[field] ?? "")) {
			return true
		}
	}

	return false
}

function selectFields(fields: readonly string[], values: FormValues): FormValues {
	const selection: FormValues = {}
	for (const field of fields) {
		selection[field] = values[field] ?? ""
	}
	return selection
}

function notifyEntry(entry: FormWatchEntry, previous: FormValues, current: FormValues): void {
	const { fields } = entry

	if (!fields?.length) {
		entry.callback(current)
		return
	}

	if (!hasRelevantChange(fields, previous, current)) {
		return
	}

	entry.callback(selectFields(fields, current))
}

function useWatchValueSubscriptions(
	data: FormValues,
	watchEntriesRef: RefObject<Set<FormWatchEntry>>,
	previousDataRef: RefObject<FormValues>,
): void {
	useEffect(() => {
		const previous = previousDataRef.current
		if (Object.is(previous, data)) return

		previousDataRef.current = data
		if (watchEntriesRef.current.size === 0) return

		for (const entry of watchEntriesRef.current) {
			notifyEntry(entry, previous, data)
		}
	}, [data, previousDataRef, watchEntriesRef])
}

export { useWatchValueSubscriptions }
