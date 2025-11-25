import React, { useEffect, useRef, useState, useCallback } from 'react';

// Khai báo 'faceapi' là biến toàn cục, giả định đã được tải từ bên ngoài (từ App.jsx)
const faceapi = window.faceapi;

// --- CONFIGURATION ---
const MODEL_URL = '/models'; // Đường dẫn đến thư mục chứa các tệp mô hình
const DETECTION_INTERVAL_MS = 100; // Tần suất quét khuôn mặt (10 lần/giây)
const CONFIDENCE_THRESHOLD = 0.6; // Ngưỡng khoảng cách tối đa để xác nhận khớp (càng nhỏ càng giống)

// Hàm giả định Gửi Vector lên Node.js Backend để so khớp
const sendVectorToBackend = async (faceVector) => {
    // *** THỰC HIỆN SO KHỚP VÀ GHI LOG Ở ĐÂY ***
    
    // Giả định: So khớp thành công với Employee ID 123
    const isMatch = Math.random() > 0.3; // 70% cơ hội khớp thành công

    if (isMatch) {
        return { 
            status: 'success', 
            employee_name: 'Nguyễn Văn A', 
            employee_id: 'NV123',
            log_type: 'CHECK_IN' 
        };
    } else {
        return { 
            status: 'failed', 
            message: 'Không tìm thấy thông tin nhân viên hoặc khuôn mặt không rõ ràng.' 
        };
    }
};

const FaceScanner = ({ onMatchFound }) => {
    const videoRef = useRef();
    const canvasRef = useRef();
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [logMessage, setLogMessage] = useState("Đang tải mô hình AI...");
    const [isScanning, setIsScanning] = useState(false);
    
    // --- B. KHỞI ĐỘNG CAMERA ---
    const startVideo = useCallback(() => {
        // Kiểm tra xem faceapi đã được tải chưa
        if (typeof faceapi === 'undefined') {
            setLogMessage("LỖI: Thư viện face-api.js chưa được tải.");
            return;
        }

        setLogMessage("Đang chờ truy cập Camera...");
        navigator.mediaDevices.getUserMedia({ video: {} })
            .then(stream => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => {
                         setLogMessage("Camera đã sẵn sàng. Đưa khuôn mặt vào khung hình.");
                         videoRef.current.play();
                    };
                }
            })
            .catch(err => {
                console.error('Lỗi khi truy cập camera:', err);
                setLogMessage("LỖI: Không thể truy cập Camera. Vui lòng kiểm tra quyền truy cập.");
            });
    }, []);

    // --- A. TẢI MÔ HÌNH VÀ KHỞI TẠO ---
    useEffect(() => {
        const loadModels = async () => {
            if (typeof faceapi === 'undefined') return;

            try {
                // Tải các mô hình cần thiết
                await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
                await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
                await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
                setModelsLoaded(true);
                setLogMessage("Mô hình AI đã tải xong.");
                startVideo(); 
            } catch (error) {
                console.error("Lỗi khi tải mô hình:", error);
                setLogMessage("LỖI: Không thể tải mô hình. Kiểm tra đường dẫn /models.");
            }
        };
        
        loadModels();
    }, [startVideo]);

    // --- C. XỬ LÝ NHẬN DIỆN THỜI GIAN THỰC ---
    const handleVideoPlay = () => {
        if (!modelsLoaded || isScanning) return;
        setIsScanning(true);

        const intervalId = setInterval(async () => {
            const video = videoRef.current;
            const canvas = canvasRef.current;

            if (!video || video.paused || video.ended || !canvas) {
                setIsScanning(false);
                return clearInterval(intervalId);
            }
            
            // Đảm bảo canvas có kích thước phù hợp với video
            const displaySize = { width: video.width, height: video.height };
            faceapi.matchDimensions(canvas, displaySize);
            const context = canvas.getContext('2d');
            context.clearRect(0, 0, canvas.width, canvas.height);


            // 1. Phát hiện Khuôn mặt và Trích xuất Đặc trưng
            const fullDetection = await faceapi.detectSingleFace(
                video,
                new faceapi.SsdMobilenetv1Options()
            )
            .withFaceLandmarks()
            .withFaceDescriptor(); 
            

            if (fullDetection) {
                const resizedDetections = faceapi.resizeResults(fullDetection, displaySize);
                
                // Vẽ bounding box (khung nhận diện)
                faceapi.draw.drawDetections(canvas, resizedDetections);
                // faceapi.draw.drawFaceLandmarks(canvas, resizedDetections); 

                const faceVector = Array.from(fullDetection.descriptor);
                
                // 2. Gửi vector lên Backend
                const result = await sendVectorToBackend(faceVector);

                if (result.status === 'success') {
                    setLogMessage(`✅ CHẤM CÔNG THÀNH CÔNG: ${result.employee_name} (${result.log_type})`);
                    if (onMatchFound) onMatchFound(result);
                    
                    // Dừng quét sau khi nhận diện thành công
                    clearInterval(intervalId); 
                    setIsScanning(false);
                    // Dừng luồng video
                    const stream = video.srcObject;
                    if (stream) {
                        const tracks = stream.getTracks();
                        tracks.forEach(track => track.stop());
                    }

                } else {
                    setLogMessage("Đang quét... Khuôn mặt được phát hiện. Đang chờ so khớp.");
                }
            } else {
                 setLogMessage("Đang quét... Không tìm thấy khuôn mặt.");
            }
        }, DETECTION_INTERVAL_MS);

        return () => {
            clearInterval(intervalId);
            setIsScanning(false);
        }
    };

    return (
        <div className="flex flex-col items-center p-4 bg-gray-50 min-h-screen">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">Hệ Thống Quản Lý Ra Vào (Face Recognition)</h1>
            
            <div className="relative border-4 border-gray-300 rounded-lg shadow-xl overflow-hidden mb-4">
                {/* Loading/Status overlay */}
                {!modelsLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70 text-white text-xl font-semibold">
                        {logMessage}
                    </div>
                )}
                <video 
                    ref={videoRef} 
                    onPlay={handleVideoPlay} 
                    autoPlay 
                    muted 
                    width="640"
                    height="480"
                    className="object-cover transform scale-x-[-1]" 
                />
                {/* Canvas nằm đè lên video để vẽ khung nhận diện */}
                <canvas 
                    ref={canvasRef} 
                    width="640" 
                    height="480" 
                    className="absolute top-0 left-0 transform scale-x-[-1]" 
                />
                
                
            </div>
            
            <div className={`p-4 rounded-lg shadow-md w-full max-w-md ${logMessage.includes('LỖI') ? 'bg-red-100 text-red-800' : logMessage.includes('THÀNH CÔNG') ? 'bg-green-100 text-green-800' : 'bg-white text-gray-700'}`}>
                <p className="font-semibold">{logMessage}</p>
            </div>
            
            {/* Nếu cần, thêm nút để bắt đầu lại quá trình */}
            {modelsLoaded && !isScanning && (
                <button 
                    onClick={startVideo} 
                    className="mt-4 px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow hover:bg-blue-700 transition duration-200"
                >
                    Bắt đầu Quét lại
                </button>
            )}
        </div>
    );
};

export default FaceScanner;