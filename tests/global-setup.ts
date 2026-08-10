/**
 * Copyright 2026 The MediaPipe Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function downloadFile(fileName: string, url: string): Promise<string> {
    const downloadPath = path.resolve(__dirname, 'assets');
    if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
    }
    const filePath = path.join(downloadPath, fileName);
    
    // Check if file already exists to avoid re-downloading
    if (fs.existsSync(filePath)) {
        return filePath;
    }

    console.log(`Downloading ${fileName} from ${url}...`);

    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filePath);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve(filePath);
            });
        }).on('error', (err) => {
            fs.unlink(filePath, () => {}); // Delete the file async.
            reject(err);
        });
    });
}

export default async function globalSetup() {
    const assets = [

        {
            name: 'efficientdet_lite0.tflite',
            url: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/1/efficientdet_lite0.tflite'
        },
        {
            name: 'efficientdet_lite2.tflite',
            url: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/float32/1/efficientdet_lite2.tflite'
        },
        {
            name: 'deeplab_v3.tflite',
            url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite'
        },
        {
            name: 'hair_segmenter.tflite',
            url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/1/hair_segmenter.tflite'
        },
        {
            name: 'yamnet.tflite',
            url: 'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite'
        },
        {
            name: 'bert_classifier.tflite',
            url: 'https://storage.googleapis.com/mediapipe-models/text_classifier/bert_classifier/float32/1/bert_classifier.tflite'
        },
        {
            name: 'average_word_classifier.tflite',
            url: 'https://storage.googleapis.com/mediapipe-models/text_classifier/average_word_classifier/float32/1/average_word_classifier.tflite'
        },
        {
            name: 'universal_sentence_encoder.tflite',
            url: 'https://storage.googleapis.com/mediapipe-models/text_embedder/universal_sentence_encoder/float32/1/universal_sentence_encoder.tflite'
        },
        {
            name: 'blaze_face_short_range.tflite',
            url: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'
        },
        {
            name: 'language_detector.tflite',
            url: 'https://storage.googleapis.com/mediapipe-models/language_detector/language_detector/float32/1/language_detector.tflite'
        },
        {
            name: 'mobilenet_v3_small.tflite',
            url: 'https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite'
        },
        {
            name: 'mobilenet_v3_large.tflite',
            url: 'https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_large/float32/1/mobilenet_v3_large.tflite'
        }
    ];

    console.log('--- Playwright Global Setup: Fetching Required Test Assets ---');
    try {
        await Promise.all(assets.map(asset => downloadFile(asset.name, asset.url)));
        console.log('--- Test Assets Verification Complete ---');
    } catch (error) {
        console.error('Error during global setup test asset fetch:', error);
        throw error;
    }
}
