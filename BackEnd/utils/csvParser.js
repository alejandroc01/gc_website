function parseCsvRecords(rawCsv) {
    const csvText = String(rawCsv || "").replace(/^\uFEFF/, "");
    const rows = [];
    let currentField = "";
    let currentRow = [];
    let insideQuotes = false;

    for (let index = 0; index < csvText.length; index += 1) {
        const character = csvText[index];
        const nextCharacter = csvText[index + 1];

        if (insideQuotes) {
            if (character === '"' && nextCharacter === '"') {
                currentField += '"';
                index += 1;
                continue;
            }

            if (character === '"') {
                insideQuotes = false;
                continue;
            }

            currentField += character;
            continue;
        }

        if (character === '"') {
            insideQuotes = true;
            continue;
        }

        if (character === ",") {
            currentRow.push(currentField);
            currentField = "";
            continue;
        }

        if (character === "\r") {
            continue;
        }

        if (character === "\n") {
            currentRow.push(currentField);
            rows.push(currentRow);
            currentField = "";
            currentRow = [];
            continue;
        }

        currentField += character;
    }

    if (currentField.length > 0 || currentRow.length > 0) {
        currentRow.push(currentField);
        rows.push(currentRow);
    }

    const nonEmptyRows = rows.filter((row) => row.some((value) => String(value || "").trim() !== ""));

    if (nonEmptyRows.length === 0) {
        return {
            headers: [],
            rows: [],
        };
    }

    const [headerRow, ...valueRows] = nonEmptyRows;
    const headers = headerRow.map((header) => String(header || "").trim());

    return {
        headers,
        rows: valueRows.map((row) => toRowObject(headers, row)),
    };
}

function toRowObject(headers, row) {
    return headers.reduce((record, header, index) => {
        record[header] = String(row[index] || "").trim();
        return record;
    }, {});
}

module.exports = {
    parseCsvRecords,
};
