import React, { useEffect, useRef, useState } from 'react';
import Quagga from 'quagga';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QrCode, Camera, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onScan, onClose, isOpen }) => {
  const scannerRef = useRef<HTMLDivElement>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && !isInitialized) {
      initializeScanner();
    }

    return () => {
      if (isInitialized) {
        Quagga.stop();
        setIsInitialized(false);
      }
    };
  }, [isOpen, isInitialized]);

  const initializeScanner = async () => {
    try {
      const config = {
        inputStream: {
          name: "Live",
          type: "LiveStream",
          target: scannerRef.current,
          constraints: {
            width: 640,
            height: 480,
            facingMode: "environment"
          }
        },
        decoder: {
          readers: [
            "code_128_reader",
            "ean_reader",
            "ean_8_reader", 
            "code_39_reader",
            "code_39_vin_reader",
            "codabar_reader",
            "upc_reader",
            "upc_e_reader"
          ]
        },
        locate: true,
        numOfWorkers: 2,
        frequency: 10,
        debug: {
          drawBoundingBox: true,
          showFrequency: false,
          drawScanline: true,
          showPattern: false
        }
      };

      await new Promise<void>((resolve, reject) => {
        Quagga.init(config, (err) => {
          if (err) {
            console.error('Quagga init error:', err);
            reject(err);
            return;
          }
          Quagga.start();
          setIsInitialized(true);
          resolve();
        });
      });

      Quagga.onDetected(async (result) => { // Made this callback async
        const code = result.codeResult.code;
        if (code) {
          // 1. Pass the scanned code to the parent component
          onScan(code); 

          // 2. Call the VITE_REACT_APP_GET_URL webhook
          const getWebhookUrl = import.meta.env.VITE_REACT_APP_GET_URL;

          if (!getWebhookUrl) {
            toast({
              title: "Webhook Not Configured",
              description: "GET webhook URL not found in environment variables.",
              duration: 7000,
            });
            handleClose();
            return;
          }

          try {
            const response = await fetch(getWebhookUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ upc: code }),
            });

            if (response.ok) {
              const data = await response.json();
              let message = data.message || "UPC information retrieved successfully.";
              message = message.replace(/\\n/g, '\n'); // Apply the fix for escaped newlines

              toast({
                title: "UPC Information",
                description: message,
                duration: 7000,
              });
            } else {
              let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
              try {
                const errorData = await response.json();
                if (errorData && errorData.message) {
                  errorMessage = errorData.message;
                }
              } catch (jsonError) {
                // If response is not JSON, use default error message
              }
              toast({
                variant: "destructive",
                title: "Failed to Get UPC Info",
                description: errorMessage,
                duration: 7000,
              });
            }
          } catch (error) {
            console.error('GET webhook call failed:', error);
            toast({
              variant: "destructive",
              title: "Network Error",
              description: `Could not retrieve UPC information. ${error instanceof Error ? error.message : 'Please try again.'}`,
              duration: 7000,
            });
          } finally {
            // 3. Close the scanner after all operations
            handleClose();
          }
        }
      });

    } catch (error) {
      console.error('Scanner initialization error:', error);
      toast({
        variant: "destructive",
        title: "Camera Error",
        description: "Could not access camera for scanning.",
      });
    }
  };

  const handleClose = () => {
    if (isInitialized) {
      Quagga.stop();
      setIsInitialized(false);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="card-surface w-full max-w-lg">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <QrCode className="w-6 h-6 text-accent" />
              <h2 className="text-xl font-semibold">Scan UPC Code</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="h-8 w-8 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-4">
            <div 
              ref={scannerRef}
              className="relative w-full h-64 bg-muted rounded-xl overflow-hidden"
            >
              {!isInitialized && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <Camera className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">Initializing camera...</p>
                  </div>
                </div>
              )}
            </div>

            <div className="text-center text-sm text-muted-foreground">
              <p>Position the barcode within the viewfinder</p>
              <p>The scanner will automatically detect and scan the code</p>
            </div>

            <Button
              onClick={handleClose}
              variant="secondary"
              className="btn-secondary w-full"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default BarcodeScanner;
