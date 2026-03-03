import { type FocusEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
	defineForm,
	deriveThrownMessage,
	deriveValidationMessage,
	extractValidator,
	flattenDefaults,
	flattenFormDefinition,
	resolveManualErrorMessage,
	toFormData,
	toInputString,
} from "./helpers"
import type {
	DotPaths,
	ErrorEntry,
	ErrorInfo,
	Errors,
	FieldData,
	FieldDefinition,
	Flags,
	FlatDefaults,
	FlatFormDefinition,
	FormDefinition,
	FormSnapshot,
	FormValues,
	FormWatchEntry,
	TypeFromDefinition,
	UseStandardSchemaReturn,
	ValidationTokenMap,
	WatchValuesCallback,
} from "./types"

function useStandardSchema<T extends FormDefinition>(formDefinition: T): UseStandardSchemaReturn<T> {
	type FieldKey = DotPaths<T>

	const flatFormDefinition = useMemo(
		() => flattenFormDefinition(formDefinition) as FlatFormDefinition<T>,
		[formDefinition],
	)

	const initialValues = useMemo(() => flattenDefaults(formDefinition) as FlatDefaults<T>, [formDefinition])

	// Cache initial string representations for comparison
	const initialValueStrings = useMemo(() => {
		const entries: FormValues = {}
		for (const [key, value] of Object.entries(initialValues)) {
			entries[key] = toInputString(value)
		}
		return entries
	}, [initialValues])

	const formDefinitionKeys = useMemo(() => Object.keys(flatFormDefinition), [flatFormDefinition])

	const [data, setData] = useState<FormValues>(initialValues)
	const [errors, setErrors] = useState<Errors>({})
	const [touched, setTouched] = useState<Flags>({})
	const [dirty, setDirty] = useState<Flags>({})

	const watchEntriesRef = useRef<Set<FormWatchEntry>>(new Set())
	const previousDataRef = useRef<FormValues>(initialValues)

	const validationTokensRef = useRef<ValidationTokenMap<string>>({})
	const validationRunId = useRef(0)

	const ensureTouched = useCallback((prev: Flags, field: string) => {
		return prev[field] ? prev : { ...prev, [field]: true }
	}, [])

	const updateDirtyFlags = useCallback((prev: Flags, field: string, isDirty: boolean) => {
		const wasDirty = Boolean(prev[field])
		if (isDirty) {
			return wasDirty ? prev : { ...prev, [field]: true }
		}
		if (!wasDirty) return prev

		const next = { ...prev }
		delete next[field]
		return next
	}, [])

	const getFieldDefinition = useCallback(
		(field: string): FieldDefinition => {
			const def = flatFormDefinition[field]
			if (!def) {
				throw new Error(`Field "${field}" not found`)
			}
			return def
		},
		[flatFormDefinition],
	)

	useEffect(() => {
		setData(initialValues)
		setErrors({})
		setTouched({})
		setDirty({})
		validationTokensRef.current = {}
		validationRunId.current += 1
		previousDataRef.current = initialValues
	}, [initialValues])

	useEffect(() => {
		const prev = previousDataRef.current
		if (prev === data) return

		previousDataRef.current = data
		if (watchEntriesRef.current.size === 0) return

		const snapshot = data
		const entries = [...watchEntriesRef.current]
		const prevMap = new Map(Object.entries(prev))

		for (const entry of entries) {
			const { fields } = entry
			if (fields && fields.length > 0) {
				const relevantChange = fields.some((field) => (prevMap.get(field) ?? "") !== (snapshot[field] ?? ""))
				if (!relevantChange) continue

				const selection: FormValues = {}
				for (const field of fields) {
					selection[field] = snapshot[field] ?? ""
				}
				entry.callback(selection)
				continue
			}

			entry.callback(snapshot)
		}
	}, [data])

	const validateFieldValue = useCallback(
		async (field: string, value: string): Promise<string> => {
			let fieldDef: FieldDefinition
			try {
				fieldDef = getFieldDefinition(field)
			} catch {
				return `Field "${String(field)}" not found`
			}

			const validator = extractValidator(fieldDef.validate)
			if (!validator) return "Validator not available"

			try {
				const result = await validator(value)
				return deriveValidationMessage(result)
			} catch (error) {
				return deriveThrownMessage(error)
			}
		},
		[getFieldDefinition],
	)

	const validateField = useCallback(
		async (field: string, value: string) => {
			const runId = validationRunId.current
			const token = (validationTokensRef.current[field] ?? 0) + 1
			validationTokensRef.current[field] = token

			const message = await validateFieldValue(field, value)

			// Race condition check: ensure form hasn't been reset or field re-validated since
			if (validationRunId.current !== runId || validationTokensRef.current[field] !== token) {
				return false
			}

			setErrors((prev) => (prev[field] === message ? prev : { ...prev, [field]: message }))
			return message === ""
		},
		[validateFieldValue],
	)

	const validateForm = useCallback(
		async (values?: FormValues) => {
			const sourceValues = values ?? data
			const runId = validationRunId.current
			const newErrors: Errors = {}
			const tokensForRun: ValidationTokenMap<string> = {}

			// Execute all validators in parallel
			await Promise.all(
				formDefinitionKeys.map(async (key) => {
					const token = (validationTokensRef.current[key] ?? 0) + 1
					validationTokensRef.current[key] = token
					tokensForRun[key] = token
					newErrors[key] = await validateFieldValue(key, sourceValues[key] ?? "")
				}),
			)

			// Ensure the form wasn't reset during validation
			if (validationRunId.current !== runId) {
				return false
			}

			setErrors((prev) => {
				if (validationRunId.current !== runId) return prev

				let changed = false
				const next: Errors = {}

				for (const key of formDefinitionKeys) {
					const prevValue = prev[key] ?? ""

					// If a newer validation started for this specific field during the batch run, ignore the batch result
					if (validationTokensRef.current[key] !== tokensForRun[key]) {
						next[key] = prevValue
						continue
					}

					const message = newErrors[key] ?? ""
					next[key] = message
					if (prevValue !== message) {
						changed = true
					}
				}

				// Check if any errors from removed fields need cleaning
				if (!changed) {
					for (const key of Object.keys(prev)) {
						if (!formDefinitionKeys.includes(key)) {
							changed = true
							break
						}
					}
					if (!changed) return prev
				}

				return next
			})

			let isValid = true
			for (const key of formDefinitionKeys) {
				// If a newer validation runs, we cannot guarantee validity of the whole form
				if (validationTokensRef.current[key] !== tokensForRun[key]) {
					isValid = false
					continue
				}

				if (newErrors[key] !== "") {
					isValid = false
				}
			}

			return isValid
		},
		[formDefinitionKeys, data, validateFieldValue],
	)

	const resetForm = useCallback(() => {
		setData(initialValues)
		setErrors({})
		setTouched({})
		setDirty({})
		validationTokensRef.current = {}
		validationRunId.current += 1
	}, [initialValues])

	const getForm = useCallback(
		(onSubmitHandler: (data: TypeFromDefinition<typeof formDefinition>) => void) => {
			const onSubmit = async (e: SubmitEvent) => {
				const formEl = e.currentTarget as HTMLFormElement
				e.preventDefault()

				// Use FormData to capture values that might not have triggered React onChange/onBlur yet
				// (e.g., autofill).
				const submissionEntries = new Map<string, string>()
				for (const [key, rawValue] of new FormData(formEl).entries()) {
					if (!submissionEntries.has(key)) {
						submissionEntries.set(key, typeof rawValue === "string" ? rawValue : String(rawValue))
					}
				}

				const updates: FormValues = {}
				let hasChanges = false

				for (const key of formDefinitionKeys) {
					const stateValue = data[key]
					const stateString = toInputString(stateValue)
					const initialString = initialValueStrings[key] ?? ""
					const submissionValue = submissionEntries.get(key)

					let resolvedValue = stateValue

					if (submissionValue !== undefined) {
						// Heuristic: If state differs from default, but submission matches default,
						// it usually means the user reverted the field in the DOM.
						// However, if the DOM value matches state, we trust state.
						const shouldPreferState = stateString !== initialString && submissionValue === initialString

						if (!shouldPreferState) {
							resolvedValue = submissionValue
						}
					}

					if (!Object.is(stateValue, resolvedValue)) {
						updates[key] = resolvedValue
						hasChanges = true
					}
				}

				const finalValues: FormValues = hasChanges ? { ...data, ...updates } : data

				if (hasChanges) {
					setData(finalValues)
				}

				const isValid = await validateForm(finalValues)
				if (isValid) {
					onSubmitHandler(finalValues as TypeFromDefinition<typeof formDefinition>)
					resetForm()
					formEl.reset()
				}
			}

			const onFocus = (e: FocusEvent<HTMLFormElement>) => {
				const field = e.target.name
				if (!field || !(field in flatFormDefinition)) return

				setTouched((prev) => ensureTouched(prev, field))
				setErrors((prev) => (prev[field] === "" ? prev : { ...prev, [field]: "" }))
			}

			const onBlur = async (e: FocusEvent<HTMLFormElement>) => {
				const field = e.target.name
				if (!field || !(field in flatFormDefinition)) return

				const value = e.target.value
				const initialValue = initialValueStrings[field] ?? ""
				const isDirty = value !== initialValue

				setTouched((prev) => ensureTouched(prev, field))
				setData((prev) => (prev[field] === value ? prev : { ...prev, [field]: value }))
				setDirty((prev) => updateDirtyFlags(prev, field, isDirty))

				await validateField(field, value)
			}

			const onReset = () => resetForm()

			return { onSubmit, onFocus, onBlur, onReset }
		},
		[
			flatFormDefinition,
			data,
			initialValueStrings,
			resetForm,
			validateField,
			formDefinitionKeys,
			validateForm,
			ensureTouched,
			updateDirtyFlags,
		],
	)

	const getField = useCallback(
		(name: FieldKey): FieldData => {
			const key = name as string
			const def = getFieldDefinition(key)
			const describedById = `${key}-description`
			const errorId = `${key}-error`

			const { validate: _validate, ...fieldDef } = def

			return {
				...fieldDef,
				name: key,
				defaultValue: data[key] ?? "",
				error: errors[key] ?? "",
				touched: touched[key] ?? false,
				dirty: dirty[key] ?? false,
				describedById,
				errorId,
			}
		},
		[data, errors, touched, dirty, getFieldDefinition],
	)

	const setField = useCallback(
		async (name: FieldKey, value: string) => {
			const field = name as string
			getFieldDefinition(field)
			const initialValue = initialValueStrings[field] ?? ""
			const isDirty = value !== initialValue

			setData((prev) => (prev[field] === value ? prev : { ...prev, [field]: value }))
			setTouched((prev) => ensureTouched(prev, field))
			setDirty((prev) => updateDirtyFlags(prev, field, isDirty))

			await validateField(field, value)
		},
		[validateField, initialValueStrings, getFieldDefinition, ensureTouched, updateDirtyFlags],
	)

	const setError = useCallback(
		(name: FieldKey, info: ErrorInfo) => {
			const field = name as string
			getFieldDefinition(field)

			const message = resolveManualErrorMessage(info)

			setErrors((prev) => {
				const current = prev[field]
				if (message == null) {
					if (current === undefined) return prev
					const next = { ...prev }
					delete next[field]
					return next
				}
				return current === message ? prev : { ...prev, [field]: message }
			})
		},
		[getFieldDefinition],
	)

	const getErrors = useCallback(
		(name?: FieldKey): ErrorEntry[] => {
			if (name) {
				const key = name as string
				const def = getFieldDefinition(key)
				const error = errors[key]
				if (!error) return []
				return [
					{
						name: key,
						error,
						label: def.label,
					},
				]
			}

			const errorEntries: ErrorEntry[] = []
			for (const key of formDefinitionKeys) {
				const error = errors[key]
				if (error) {
					const def = getFieldDefinition(key)
					errorEntries.push({
						name: key,
						error,
						label: def.label,
					})
				}
			}
			return errorEntries
		},
		[formDefinitionKeys, errors, getFieldDefinition],
	)

	const isTouched = useCallback(
		(name?: FieldKey) => {
			if (name) {
				const key = name as string
				return Boolean(touched[key])
			}
			return Object.values(touched).some(Boolean)
		},
		[touched],
	)

	const isDirty = useCallback(
		(name?: FieldKey) => {
			if (name) {
				const key = name as string
				return Boolean(dirty[key])
			}
			return Object.values(dirty).some(Boolean)
		},
		[dirty],
	)

	const watchValues = useCallback(
		((
			first: FieldKey | readonly FieldKey[] | ((values: FormSnapshot<T>) => void),
			second?: (values: FormSnapshot<T>) => void,
		) => {
			const hasExplicitTargets = typeof first !== "function"
			const targets = hasExplicitTargets ? (Array.isArray(first) ? [...first] : [first]) : undefined
			const callback = hasExplicitTargets ? second : (first as (values: FormSnapshot<T>) => void)

			if (typeof callback !== "function") {
				throw new Error("watchValues requires a callback")
			}

			if (targets) {
				for (const field of targets) {
					getFieldDefinition(field as string)
				}
			}

			const entry: FormWatchEntry<string> = {
				fields: targets?.map((key) => key as string),
				callback: (values) => {
					callback(values as FormSnapshot<T>)
				},
			}

			watchEntriesRef.current = new Set([...watchEntriesRef.current, entry])
			return () => {
				watchEntriesRef.current = new Set([...watchEntriesRef.current].filter((existing) => existing !== entry))
			}
		}) as WatchValuesCallback<T>,
		[getFieldDefinition],
	)

	return {
		resetForm,
		getForm,
		getField,
		getErrors,
		setField,
		setError,
		isTouched,
		isDirty,
		watchValues,
	}
}

export { useStandardSchema, defineForm, toFormData }
export type {
	ErrorEntry,
	ErrorInfo,
	FieldData,
	FieldDefinition,
	FormDefinition,
	TypeFromDefinition,
	UseStandardSchemaReturn,
	WatchValuesCallback,
} from "./types"
