
import os
import io
from functools import wraps

from flask import (
    Flask, render_template, request, jsonify,
    send_file, redirect, url_for, flash
)
from flask_login import (
    LoginManager, UserMixin, current_user,
    login_user, logout_user, login_required
)
from flask_sqlalchemy import SQLAlchemy
from authlib.integrations.flask_client import OAuth
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
from google import genai
from PIL import Image

# Load environment variables from .env
load_dotenv()

app = Flask(__name__)

app.config["SECRET_KEY"] = os.environ.get("FLASK_SECRET_KEY")

if not app.config["SECRET_KEY"]:
    raise RuntimeError(
        "FLASK_SECRET_KEY is missing. Check your .env file."
    )

app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///users.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = (
    os.environ.get("COOKIE_SECURE", "false").lower() == "true"
)

db = SQLAlchemy(app)

# Login manager
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = "login"

# Google OAuth
oauth = OAuth(app)

oauth.register(
    name="google",
    client_id=os.environ.get("GOOGLE_CLIENT_ID"),
    client_secret=os.environ.get("GOOGLE_CLIENT_SECRET"),
    server_metadata_url=(
        "https://accounts.google.com/.well-known/openid-configuration"
    ),
    client_kwargs={"scope": "openid email profile"},
)


# Database model
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=True)
    google_id = db.Column(db.String(255), unique=True, nullable=True)


@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))


with app.app_context():
    db.create_all()


@app.context_processor
def inject_login_status():
    return {"logged_in": current_user.is_authenticated}


# Login check for API endpoints
def login_required_json(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not current_user.is_authenticated:
            return jsonify({
                "success": False,
                "error": "Please log in to use this feature."
            }), 401

        return view(*args, **kwargs)

    return wrapped



# HOME / LANDING PAGE
@app.route("/")
def index():
    return render_template("index.html")


# VIDEO EDITOR
@app.route("/editor")
def editor():
    return render_template("editor.html")


# SIGN UP
@app.route("/signup", methods=["GET", "POST"])
def signup():
    if current_user.is_authenticated:
        return redirect(url_for("index"))

    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        if not email or "@" not in email or len(password) < 8:
            flash(
                "Enter a valid email and a password of at least 8 characters."
            )
            return render_template("signup.html")

        if User.query.filter_by(email=email).first():
            flash("An account with this email already exists.")
            return render_template("signup.html")

        user = User(
            email=email,
            password_hash=generate_password_hash(password)
        )

        db.session.add(user)
        db.session.commit()

        login_user(user)
        return redirect(url_for("index"))

    return render_template("signup.html")


# LOGIN
@app.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("index"))

    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        user = User.query.filter_by(email=email).first()

        if (
            user
            and user.password_hash
            and check_password_hash(user.password_hash, password)
        ):
            login_user(user)

            next_url = request.args.get("next", "")

            if next_url.startswith("/") and not next_url.startswith("//"):
                return redirect(next_url)

            return redirect(url_for("index"))

        flash("Invalid email or password.")

    return render_template("login.html")


# GOOGLE LOGIN
@app.route("/login/google")
def google_login():
    if not os.environ.get("GOOGLE_CLIENT_ID") or not os.environ.get(
        "GOOGLE_CLIENT_SECRET"
    ):
        flash("Google sign-in is not configured yet.")
        return redirect(url_for("login"))

    return oauth.google.authorize_redirect(
        url_for("google_callback", _external=True)
    )


@app.route("/login/google/callback")
def google_callback():
    token = oauth.google.authorize_access_token()
    profile = token.get("userinfo")

    if not profile or not profile.get("sub") or not profile.get("email"):
        return "Google account information is unavailable.", 400

    if not profile.get("email_verified"):
        return "Please use a Google account with a verified email.", 403

    google_id = profile["sub"]
    email = profile["email"].strip().lower()

    user = User.query.filter_by(google_id=google_id).first()

    if not user:
        user = User.query.filter_by(email=email).first()

        if user:
            flash("Log in with your existing method before linking Google.")
            return redirect(url_for("login"))

        user = User(email=email, google_id=google_id)
        db.session.add(user)
        db.session.commit()

    login_user(user)
    return redirect(url_for("index"))


# LOGOUT
@app.route("/logout", methods=["POST"])
@login_required
def logout():
    logout_user()
    return redirect(url_for("index"))


# AI ASSIST — LOGIN REQUIRED
@app.route("/api/ai-assist", methods=["POST"])
@login_required_json
def ai_assist():
    data = request.get_json(silent=True) or {}

    action = data.get("action", "suggestions")
    video_name = str(data.get("video_name", "video"))[:200]

    prompts = {
        "title": (
            f"Generate 3 catchy YouTube titles for a video named "
            f"'{video_name}'. Return each title on a separate line."
        ),
        "description": (
            f"Write an engaging YouTube description for a video named "
            f"'{video_name}'."
        ),
        "hashtags": (
            f"Generate 8 relevant hashtags for a video named "
            f"'{video_name}'. Return only hashtags separated by spaces."
        ),
        "caption": (
            f"Create sample timestamped captions for a video named "
            f"'{video_name}'."
        ),
        "suggestions": (
            f"Give 5 useful video editing tips for a clip named "
            f"'{video_name}'."
        )
    }

    prompt = prompts.get(action, prompts["suggestions"])

    try:
        api_key = os.environ.get("GEMINI_API_KEY")

        if not api_key:
            return jsonify({
                "success": False,
                "error": "GEMINI_API_KEY is not configured."
            }), 500

        client = genai.Client(api_key=api_key)

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt
        )

        return jsonify({
            "success": True,
            "result": getattr(response, "text", None)
            or "No response generated."
        })

    except Exception:
        app.logger.exception("AI assist failed")
        return jsonify({
            "success": False,
            "error": "AI assist failed. Please try again."
        }), 500


# MAKE GIF — LOGIN REQUIRED
@app.route("/api/make-gif", methods=["POST"])
@login_required_json
def make_gif():
    files = request.files.getlist("images")

    if not files:
        return jsonify({
            "success": False,
            "error": "No images uploaded."
        }), 400

    try:
        frames = []

        for file in files:
            if not file or not file.filename:
                continue

            try:
                image = Image.open(file.stream)
                image.load()
                image = image.convert("RGB")
                image.thumbnail((500, 500), Image.Resampling.LANCZOS)

                canvas = Image.new("RGB", (500, 500), "black")
                x = (500 - image.width) // 2
                y = (500 - image.height) // 2
                canvas.paste(image, (x, y))

                frames.append(canvas)

            except Exception:
                continue

        if not frames:
            return jsonify({
                "success": False,
                "error": "No valid image frames were uploaded."
            }), 400

        output = io.BytesIO()

        frames[0].save(
            output,
            format="GIF",
            save_all=True,
            append_images=frames[1:],
            duration=100,
            loop=0,
            optimize=False
        )

        output.seek(0)

        return send_file(
            output,
            mimetype="image/gif",
            as_attachment=True,
            download_name="my_animation.gif"
        )

    except Exception:
        app.logger.exception("GIF creation failed")
        return jsonify({
            "success": False,
            "error": "GIF creation failed. Please try again."
        }), 500


# RUN SERVER
if __name__ == "__main__":
    app.run(debug=True)