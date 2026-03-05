import { deriveThrownMessage, deriveValidationMessage } from "./helpers"
import type {
	Errors,
	FieldValidationResult,
	FormValidationResult,
	FormValues,
	StandardValidator,
	ValidationRuntime,
	ValidationTokenMap,
} from "./types"

async function validateWith(validator: StandardValidator | undefined, value: string): Promise<string> {
	if (!validator) return "Validator not available"

	try {
		const result = await validator(value)
		return deriveValidationMessage(result)
	} catch (error) {
		return deriveThrownMessage(error)
	}
}

export function createValidationRuntime(
	fieldKeys: readonly string[],
	validators: Record<string, StandardValidator | undefined>,
): ValidationRuntime {
	let validationRunId = 0
	let validationTokens: ValidationTokenMap<string> = Object.create(null)

	const invalidateAll = () => {
		validationTokens = Object.create(null)
		validationRunId += 1
	}

	const validateField = async (field: string, value: string): Promise<FieldValidationResult> => {
		const runId = validationRunId
		const token = (validationTokens[field] ?? 0) + 1
		validationTokens[field] = token

		const message = await validateWith(validators[field], value)
		if (validationRunId !== runId || validationTokens[field] !== token) {
			return { stale: true, message }
		}

		return { stale: false, message }
	}

	const validateForm = async (values: FormValues): Promise<FormValidationResult> => {
		const runId = validationRunId
		const errors = Object.create(null) as Errors
		const tokensForRun = Object.create(null) as ValidationTokenMap<string>

		await Promise.all(
			fieldKeys.map(async (key) => {
				const token = (validationTokens[key] ?? 0) + 1
				validationTokens[key] = token
				tokensForRun[key] = token
				errors[key] = await validateWith(validators[key], values[key] ?? "")
			}),
		)

		if (validationRunId !== runId) {
			return {
				stale: true,
				isValid: false,
				errors,
				tokensForRun,
			}
		}

		let isValid = true
		for (const key of fieldKeys) {
			if (validationTokens[key] !== tokensForRun[key]) {
				isValid = false
				continue
			}

			if ((errors[key] ?? "") !== "") {
				isValid = false
			}
		}

		return {
			stale: false,
			isValid,
			errors,
			tokensForRun,
		}
	}

	const buildErrorsFromBatch = (
		previousErrors: Errors,
		batchErrors: Errors,
		tokensForRun: ValidationTokenMap<string>,
	): Errors => {
		let changed = false

		for (const key of fieldKeys) {
			const previous = previousErrors[key] ?? ""
			const message = validationTokens[key] === tokensForRun[key] ? (batchErrors[key] ?? "") : previous
			if (previous !== message) {
				changed = true
				break
			}
		}

		if (!changed) {
			return previousErrors
		}

		const nextErrors: Errors = {}
		for (const key of fieldKeys) {
			const previous = previousErrors[key] ?? ""
			nextErrors[key] = validationTokens[key] === tokensForRun[key] ? (batchErrors[key] ?? "") : previous
		}

		return nextErrors
	}

	return {
		invalidateAll,
		validateField,
		validateForm,
		buildErrorsFromBatch,
	}
}
