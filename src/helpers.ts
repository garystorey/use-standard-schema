import type {
	AssertValidFormKeysDeep,
	ErrorInfo,
	FieldDefinition,
	FlatDefaults,
	FlatFormDefinition,
	FormDefinition,
	FormValues,
	StandardValidator,
} from "./types"

export function defineForm<T extends FormDefinition>(
	formDefinition: AssertValidFormKeysDeep<T>,
): AssertValidFormKeysDeep<T> {
	return formDefinition
}

function isPlainObject(value: unknown): value is { [key: string]: unknown } {
	return (
		typeof value === "object" &&
		value !== null &&
		(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
	)
}

export function isFieldDefinition(obj: unknown): obj is FieldDefinition {
	return typeof obj === "object" && obj !== null && "label" in obj && "validate" in obj
}

export function toFormData(data: FormValues): FormData
export function toFormData(data: { [key: string]: unknown }) {
	const formData = new FormData()
	Object.entries(data).forEach(([key, value]) => {
		if (value !== undefined && value !== null) {
			formData.append(key, String(value))
		}
	})
	return formData
}

export function flattenFormDefinition<Def extends FormDefinition>(
	formDefinition: Def,
	parentPath?: string,
): FlatFormDefinition<Def>

export function flattenFormDefinition(
	formDefinition: FormDefinition,
	parentPath?: string,
): FlatFormDefinition

export function flattenFormDefinition(
	formDefinition: FormDefinition,
	parentPath = "",
): FlatFormDefinition {
	const flattened = {} as FlatFormDefinition

	for (const [propertyKey, propertyValue] of Object.entries(formDefinition)) {
		const fullPath = parentPath ? `${parentPath}.${propertyKey}` : propertyKey

		if (isFieldDefinition(propertyValue)) {
			flattened[fullPath] = propertyValue
			continue
		}

		if (isPlainObject(propertyValue)) {
			Object.assign(flattened, flattenFormDefinition(propertyValue as FormDefinition, fullPath))
		}
	}

	return flattened
}

function isValidatorFunction(value: unknown): value is StandardValidator {
	return typeof value === "function"
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null
}

export function extractValidator(value: unknown): StandardValidator | undefined {
	if (isValidatorFunction(value)) return value

	if (!isRecord(value)) return undefined

	// Check Standard Schema V1 signature
	const standardValidator = value["~standard"]
	if (isRecord(standardValidator) && isValidatorFunction((standardValidator as { validate?: unknown }).validate)) {
		return (standardValidator as { validate: StandardValidator }).validate
	}

	// Fallback/Direct validator structure
	const directValidator = (value as { validate?: unknown }).validate
	if (isValidatorFunction(directValidator)) {
		return directValidator
	}

	return undefined
}

export function deriveValidationMessage(result: unknown): string {
	if (typeof result === "string") return result
	if (!isRecord(result)) return ""

	const resultRecord = result as { [key: string]: unknown; issues?: unknown; message?: unknown }
	const issues = Array.isArray(resultRecord.issues) ? resultRecord.issues : []

	for (const issue of issues) {
		if (!isRecord(issue)) continue
		const message = (issue as { message?: unknown }).message
		if (typeof message === "string" && message.trim().length > 0) {
			return message
		}
	}

	if (typeof resultRecord.message === "string") {
		return resultRecord.message.trim().length > 0 ? resultRecord.message : ""
	}

	return ""
}

export function deriveThrownMessage(error: unknown): string {
	if (error instanceof Error && error.message) return error.message
	if (typeof error === "string" && error.trim().length > 0) return error
	return "validation failed"
}

export function resolveManualErrorMessage(info: ErrorInfo): string | null {
	if (info == null) return null
	if (typeof info === "string") {
		const trimmed = info.trim()
		return trimmed.length > 0 ? trimmed : null
	}

	if (info instanceof Error) {
		const message = info.message?.trim()
		return message && message.length > 0 ? message : null
	}

	const details = info as { message?: unknown }
	if (typeof details.message === "string") {
		const message = details.message.trim()
		return message.length > 0 ? message : null
	}

	return null
}

export function toInputString(value: unknown): string {
	if (typeof value === "string") return value
	if (value == null) return ""
	return String(value)
}

export function flattenDefaults<Def extends FormDefinition>(
	formDefinition: Def,
	parentPath?: string,
): FlatDefaults<Def>

export function flattenDefaults(formDefinition: FormDefinition, parentPath?: string): FlatDefaults

export function flattenDefaults(formDefinition: FormDefinition, parentPath = ""): FlatDefaults {
	const flattened = {} as FlatDefaults

	for (const [propertyKey, propertyValue] of Object.entries(formDefinition)) {
		const fullPath = parentPath ? `${parentPath}.${propertyKey}` : propertyKey

		if (isFieldDefinition(propertyValue)) {
			flattened[fullPath] = propertyValue.defaultValue ?? ""
			continue
		}

		if (isPlainObject(propertyValue)) {
			Object.assign(flattened, flattenDefaults(propertyValue as FormDefinition, fullPath))
		}
	}

	return flattened
}
