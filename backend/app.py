from pathlib import Path
import joblib
import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS


app = Flask(__name__)
CORS(app)
MODEL_PATH = Path(__file__).resolve().with_name(
    "drowsiness_random_forest.pkl"
)

model = joblib.load(MODEL_PATH)

EXPECTED_FEATURES = [
    "left_EAR",
    "right_EAR",
    "average_EAR",
]


@app.route("/", methods=["GET"])
def index():
    return jsonify(
        {
            "service": "Driver Drowsiness Prediction API",
            "status": "running",
            "model": "RandomForestClassifier",
            "classes": [
                str(value)
                for value in model.classes_
            ],
            "predict_endpoint": {
                "method": "POST",
                "path": "/predict",
            },
        }
    )


@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.get_json(
            silent=True
        )

        if not isinstance(data, dict):
            return jsonify(
                {
                    "error": "Request body must be valid JSON."
                }
            ), 400

        missing = [
            feature
            for feature in EXPECTED_FEATURES
            if feature not in data
        ]

        if missing:
            return jsonify(
                {
                    "error": (
                        "Missing required feature(s): "
                        + ", ".join(missing)
                    )
                }
            ), 400

        left_ear = float(
            data["left_EAR"]
        )

        right_ear = float(
            data["right_EAR"]
        )

        average_ear = float(
            data["average_EAR"]
        )

        features = pd.DataFrame(
            [
                [
                    left_ear,
                    right_ear,
                    average_ear,
                ]
            ],
            columns=EXPECTED_FEATURES,
        )

        prediction = str(
            model.predict(features)[0]
        )

        probabilities = (
            model.predict_proba(
                features
            )[0]
        )

        probability_map = {
            str(label): float(probability)
            for label, probability in zip(
                model.classes_,
                probabilities,
            )
        }

        drowsy_probability = float(
            probability_map.get(
                "Drowsy",
                0.0,
            )
        )

        print(
            "EAR:",
            {
                "left": round(left_ear, 4),
                "right": round(right_ear, 4),
                "average": round(average_ear, 4),
            },
            "Prediction:",
            prediction,
            "Drowsy probability:",
            round(
                drowsy_probability,
                4,
            ),
        )

        return jsonify(
            {
                "prediction": prediction,
                "probabilities": probability_map,
                "drowsy_probability": drowsy_probability,
                "input": {
                    "left_EAR": left_ear,
                    "right_EAR": right_ear,
                    "average_EAR": average_ear,
                },
            }
        )

    except (TypeError, ValueError) as error:
        return jsonify(
            {
                "error": (
                    "EAR values must be numeric: "
                    f"{error}"
                )
            }
        ), 400

    except Exception as error:
        app.logger.exception(
            "Prediction failed"
        )

        return jsonify(
            {
                "error": str(error)
            }
        ), 500


if __name__ == "__main__":
    print(
        f"Loaded model from: {MODEL_PATH}"
    )
    print(
        "Classes:",
        [
            str(value)
            for value in model.classes_
        ],
    )

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True,
    )
