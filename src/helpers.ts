import type {
	AssertValidFormKeysDeep,
	ErrorInfo,
	FieldDefinition,
	Flags,
	FlatDefaults,
	FlatFormDefinition,
	FormDefinition,
	FormValues,
	StandardValidator,
} from "./types"

const DISALLOWED_PATH_SEGMENTS = new Set(["__proto__", "constructor", "prototype"])

export function defineForm<T extends FormDefinition>(
	formDefinition: AssertValidFormKeysDeep<T>,
): AssertValidFormKeysDeep<T> {
	assertValidFormDefinition(formDefinition)
	return formDefinition
}


function assertValidFormDefinition(formDefinition: unknown, parentPath = ""): void {
	if (!isPlainObject(formDefinition)) {
		const pathLabel = parentPath || "<root>"
		throw new Error(`Invalid form definition at "${pathLabel}": expected a plain object`)
	}

	for (const [propertyKey, propertyValue] of Object.entries(formDefinition)) {
		const fullPath = parentPath ? `${parentPath}.${propertyKey}` : propertyKey
		assertSafePathKey(propertyKey, fullPath)

		if (isFieldDefinition(propertyValue)) {
			assertValidFieldDefinition(propertyValue, fullPath)
			continue
		}

		if (isPlainObject(propertyValue)) {
			assertValidFormDefinition(propertyValue, fullPath)
			continue
		}

		throw new Error(`Invalid form definition at "${fullPath}": expected a field definition or nested object`)
	}
}

function assertValidFieldDefinition(fieldDefinition: FieldDefinition, fullPath: string): void {
	if (typeof fieldDefinition.label !== "string") {
		throw new Error(`Invalid field label at "${fullPath}": expected a string`)
	}

	if (fieldDefinition.description !== undefined && typeof fieldDefinition.description !== "string") {
		throw new Error(`Invalid field description at "${fullPath}": expected a string`)
	}

	if (fieldDefinition.defaultValue !== undefined && typeof fieldDefinition.defaultValue !== "string") {
		throw new Error(`Invalid field defaultValue at "${fullPath}": expected a string`)
	}

	if (!extractValidator(fieldDefinition.validate)) {
		throw new Error(`Invalid field validator at "${fullPath}": expected a Standard Schema validator`)
	}
}

function assertSafePathKey(key: string, fullPath: string): void {
	for (const segment of key.split(".")) {
		if (DISALLOWED_PATH_SEGMENTS.has(segment)) {
			throw new Error(`Unsafe form key segment "${segment}" at "${fullPath}"`)
		}
	}
}

function isPlainObject(value: unknown): value is { [key: string]: unknown } {
	return (
		typeof value === "object" &&
		value !== null &&
		(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
	)
}

export function isFieldDefinition(obj: unknown): obj is FieldDefinition {
	return typeof obj === "object" && obj !== null && Object.hasOwn(obj as object, "label") && Object.hasOwn(obj as object, "validate")
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
	const flattened = Object.create(null) as FlatFormDefinition

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

export function ensureTouched(prev: Flags, field: string): Flags {
	return prev[field] ? prev : { ...prev, [field]: true }
}

export function updateDirtyFlags(prev: Flags, field: string, isDirty: boolean): Flags {
	const wasDirty = Boolean(prev[field])
	if (isDirty) {
		return wasDirty ? prev : { ...prev, [field]: true }
	}
	if (!wasDirty) return prev

	const next = { ...prev }
	delete next[field]
	return next
}

type SetFlagsState = (value: Flags | ((prev: Flags) => Flags)) => void

export function setTouchedAndDirty(
	field: string,
	isDirty: boolean,
	setTouched: SetFlagsState,
	setDirty: SetFlagsState,
): void {
	setTouched((prev) => ensureTouched(prev, field))
	setDirty((prev) => updateDirtyFlags(prev, field, isDirty))
}

export function isFlagSet(flags: Flags, field?: string): boolean {
	if (field !== undefined) {
		return Boolean(flags[field])
	}

	for (const value of Object.values(flags)) {
		if (value) return true
	}
	return false
}

export function flattenDefaults<Def extends FormDefinition>(
	formDefinition: Def,
	parentPath?: string,
): FlatDefaults<Def>

export function flattenDefaults(formDefinition: FormDefinition, parentPath?: string): FlatDefaults

export function flattenDefaults(formDefinition: FormDefinition, parentPath = ""): FlatDefaults {
	const flattened = Object.create(null) as FlatDefaults

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

