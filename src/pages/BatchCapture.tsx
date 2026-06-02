import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export default function BatchCapture() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string>("");

  const run = async () => {
    setLoading(true);
    setResult("");
    setError("");
    const { data, error } = await supabase.functions.invoke("batch-capture", {
      body: {},
    });
    const pretty = JSON.stringify(data, null, 2);
    console.log(pretty);
    if (error) setError(error.message);
    setResult(pretty);
    setLoading(false);
  };

  return (
    <div className="container mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Batch Capture</h1>
      <Button onClick={run} disabled={loading}>
        {loading ? "Executando..." : "Invocar batch-capture"}
      </Button>
      {error && (
        <pre className="bg-destructive/10 text-destructive p-4 rounded overflow-auto text-xs">
          {error}
        </pre>
      )}
      {result && (
        <pre className="bg-muted p-4 rounded overflow-auto text-xs max-h-[70vh]">
          {result}
        </pre>
      )}
    </div>
  );
}