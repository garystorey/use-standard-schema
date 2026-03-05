import type { RefObject } from "react"
import { useEffect } from "react"
import type { FormValues, FormWatchEntry } from "./types"

function selectChangedFields(fields: readonly string[], previous: FormValues, current: FormValues): FormValues | null {
	const selection: FormValues = {}
	let hasChange = false

	for (const field of fields) {
		const previousValue = previous[field] ?? ""
		const currentValue = current[field] ?? ""
		selection[field] = currentValue
		if (previousValue !== currentValue) {
			hasChange = true
		}
	}

	return hasChange ? selection : null
}

function notifyEntry(entry: FormWatchEntry, previous: FormValues, current: FormValues): void {
	const { fields } = entry

	if (!fields?.length) {
		entry.callback(current)
		return
	}

	const selected = selectChangedFields(fields, previous, current)
	if (!selected) {
		return
	}

	entry.callback(selected)
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
