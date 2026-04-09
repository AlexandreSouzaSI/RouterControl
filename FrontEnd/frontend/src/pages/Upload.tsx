import { useState } from 'react';

export function Upload() {
    const [file, setFile] = useState<File | null>(null);
    const [result, setResult] = useState<any>(null);

    const handleUpload = async () => {
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('http://localhost:3000/upload', {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();
        setResult(data);
    };

    return (
        <div style={{ padding: 20 }}>
            <h2>Upload Excel</h2>

            <input
                type="file"
                onChange={(e) => {
                    if (e.target.files) {
                        setFile(e.target.files[0]);
                    }
                }}
            />

            <button onClick={handleUpload}>Enviar</button>

            {result && (
                <pre>{JSON.stringify(result, null, 2)}</pre>
            )}
        </div>
    );
}