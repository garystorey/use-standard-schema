import { ensureTouched, updateDirtyFlags } from "./helpers"
import type { FormAction, FormState, FormValues } from "./types"

export function createFormState(values: FormValues): FormState {
	return {
		values,
		errors: {},
		touched: {},
		dirty: {},
	}
}

function shallowEqualRecords<T extends string | boolean>(a: Record<string, T>, b: Record<string, T>): boolean {
	const aKeys = Object.keys(a)
	const bKeys = Object.keys(b)
	if (aKeys.length !== bKeys.length) return false

	for (const key of aKeys) {
		if (a[key] !== b[key]) return false
	}

	return true
}

export function formReducer(state: FormState, action: FormAction): FormState {
	switch (action.type) {
		case "reset":
			return {
				values: action.values,
				errors: {},
				touched: {},
				dirty: {},
			}

		case "focusField": {
			const nextTouched = ensureTouched(state.touched, action.field)
			const nextErrors =
				state.errors[action.field] === "" ? state.errors : { ...state.errors, [action.field]: "" }

			if (nextTouched === state.touched && nextErrors === state.errors) {
				return state
			}

			return {
				...state,
				touched: nextTouched,
				errors: nextErrors,
			}
		}

		case "commitFieldValue": {
			const isDirty = action.value !== action.initialValue
			const nextTouched = ensureTouched(state.touched, action.field)
			const nextDirty = updateDirtyFlags(state.dirty, action.field, isDirty)
			const nextValues =
				state.values[action.field] === action.value ? state.values : { ...state.values, [action.field]: action.value }

			if (nextTouched === state.touched && nextDirty === state.dirty && nextValues === state.values) {
				return state
			}

			return {
				...state,
				touched: nextTouched,
				dirty: nextDirty,
				values: nextValues,
			}
		}

		case "mergeResolvedSubmissionValues": {
			if (Object.is(state.values, action.values)) {
				return state
			}

			return {
				...state,
				values: action.values,
			}
		}

		case "setFieldError": {
			if (action.message == null) {
				if (!Object.hasOwn(state.errors, action.field)) return state

				const nextErrors = { ...state.errors }
				delete nextErrors[action.field]
				return {
					...state,
					errors: nextErrors,
				}
			}

			if (state.errors[action.field] === action.message) {
				return state
			}

			return {
				...state,
				errors: { ...state.errors, [action.field]: action.message },
			}
		}

		case "setAllErrors": {
			if (state.errors === action.errors || shallowEqualRecords(state.errors, action.errors)) {
				return state
			}

			return {
				...state,
				errors: action.errors,
			}
		}

		default:
			return state
	}
}

