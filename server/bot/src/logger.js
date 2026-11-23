const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function serializeError(error) {
  if (!error) {
    return undefined;
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      code: error.code ?? null,
      stack: error.stack ?? null,
    };
  }

  return { message: String(error) };
}

// 한 줄 = JSON 하나. docker logs 로 그대로 수집할 수 있습니다.
export function createLogger(level = "info") {
  const min = LEVELS[level] ?? LEVELS.info;

  function emit(lvl, msg, fields = {}) {
    if (LEVELS[lvl] < min) {
      return;
    }

    const { err, error, ...rest } = fields;
    const line = {
      ts: new Date().toISOString(),
      level: lvl,
      service: "honjaya-bot",
      msg,
      ...rest,
    };

    const detail = serializeError(error ?? err);

    if (detail) {
      line.err = detail;
    }

    const text = `${JSON.stringify(line)}\n`;

    if (lvl === "warn" || lvl === "error") {
      process.stderr.write(text);
    } else {
      process.stdout.write(text);
    }
  }

  return {
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
  };
}
