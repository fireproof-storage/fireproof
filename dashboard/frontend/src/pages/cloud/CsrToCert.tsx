import React, { useContext, useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router-dom";
import { BuildURI } from "@adviser/cement";
import { AppContext } from "../../app-context.js";

interface CsrFormInputs {
  csrContent: string;
}

export function CsrToCert() {
  const { cloud } = useContext(AppContext);
  const [searchParams] = useSearchParams();
  const csrParam = searchParams.get("csr");
  const returnUrl = searchParams.get("returnUrl");

  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<CsrFormInputs>({
    defaultValues: {
      csrContent: csrParam || "",
    },
  });
  const [certificate, setCertificate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasAutoSubmitted = useRef(false);

  // Auto-submit when CSR param is provided and session is ready
  useEffect(() => {
    if (csrParam && !hasAutoSubmitted.current && cloud.sessionReady(true)) {
      hasAutoSubmitted.current = true;
      // Directly call onSubmit instead of simulating click
      onSubmit({ csrContent: csrParam });
    }
  }, [csrParam, cloud.sessionReady(true)]);

  // Navigate back to returnUrl with cert param after certificate is received
  useEffect(() => {
    if (certificate && returnUrl) {
      const timer = setTimeout(() => {
        const urlWithCert = BuildURI.from(returnUrl).setParam("cert", certificate).toString();
        // console.log(">>>>>", urlWithCert);
        window.location.href = urlWithCert;
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [certificate, returnUrl]);

  const onSubmit = async (data: CsrFormInputs) => {
    try {
      setError(null);
      setCertificate(null);
      // console.log("Submitting CSR:", data.csrContent);

      const result = await cloud.api.getCertFromCsr({ csr: data.csrContent });

      if (result.isOk()) {
        const response = result.Ok();
        setCertificate(response.certificate);
        // console.log("Certificate received:", response.certificate);
      } else {
        const errorMsg = result.Err();
        setError(typeof errorMsg === "string" ? errorMsg : "Failed to get certificate");
        // console.error("Error getting certificate:", errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "An unexpected error occurred";
      setError(errorMsg);
      // console.error("Exception during CSR submission:", err);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">CSR to Certificate Converter</h2>
      <p className="mb-4">Submit a Certificate Signing Request (CSR) to receive a signed certificate.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-4">
        <label htmlFor="csr-input" className="block text-sm font-medium text-gray-700">
          Enter CSR content:
        </label>
        <textarea
          id="csr-input"
          rows={10}
          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm font-mono"
          placeholder="-----BEGIN CERTIFICATE REQUEST-----&#10;Paste your CSR here...&#10;-----END CERTIFICATE REQUEST-----"
          {...register("csrContent", { required: true })}
        ></textarea>
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Submitting..." : "Submit CSR"}
        </button>
      </form>

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <h3 className="text-sm font-medium text-red-800">Error</h3>
          <p className="mt-2 text-sm text-red-700">{error}</p>
        </div>
      )}

      {certificate && (
        <div className="mt-4">
          <h3 className="text-lg font-semibold mb-2">Signed Certificate</h3>
          {returnUrl && (
            <div className="mb-2 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-800">
              Redirecting back in 3 seconds...
            </div>
          )}
          <div className="bg-green-50 border border-green-200 rounded-md p-4">
            <textarea
              readOnly
              rows={15}
              className="w-full border-0 bg-transparent focus:ring-0 font-mono text-sm"
              value={certificate}
            ></textarea>
            <button
              onClick={() => {
                navigator.clipboard.writeText(certificate);
                alert("Certificate copied to clipboard!");
              }}
              className="mt-2 inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-green-700 bg-green-100 hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
              Copy to Clipboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
