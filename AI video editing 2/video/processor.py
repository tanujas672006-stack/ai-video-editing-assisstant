import os
import uuid
import subprocess

BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.abspath(__file__)
    )
)

OUTPUT_FOLDER = os.path.join(
    BASE_DIR,
    "static",
    "output"
)

os.makedirs(
    OUTPUT_FOLDER,
    exist_ok=True
)


# =========================================================
# HELPER
# =========================================================

def create_output_file(prefix="output", extension=".mp4"):

    filename = (
        prefix
        + "_"
        + uuid.uuid4().hex[:10]
        + extension
    )

    return os.path.join(
        OUTPUT_FOLDER,
        filename
    )


def run_ffmpeg(command):

    try:

        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        if result.returncode != 0:

            print("FFmpeg Error:")
            print(result.stderr)

            return False

        return True

    except FileNotFoundError:

        print(
            "FFmpeg was not found. "
            "Please install FFmpeg and add it to PATH."
        )

        return False

    except Exception as error:

        print(
            "Video processing error:",
            error
        )

        return False


# =========================================================
# CONVERT VIDEO
# =========================================================

def convert_video(input_file):

    output_file = create_output_file(
        "converted"
    )

    command = [
        "ffmpeg",
        "-y",
        "-i",
        input_file,
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        output_file
    ]

    if run_ffmpeg(command):

        return output_file

    return None


# =========================================================
# TRIM VIDEO
# =========================================================

def trim_video(
    input_file,
    start_time,
    end_time
):

    output_file = create_output_file(
        "trimmed"
    )

    try:

        start_time = float(
            start_time
        )

        end_time = float(
            end_time
        )

        duration = (
            end_time -
            start_time
        )

        if duration <= 0:

            return None

    except (ValueError, TypeError):

        return None


    command = [
        "ffmpeg",
        "-y",

        "-ss",
        str(start_time),

        "-i",
        input_file,

        "-t",
        str(duration),

        "-c:v",
        "libx264",

        "-c:a",
        "aac",

        "-movflags",
        "+faststart",

        output_file
    ]


    if run_ffmpeg(command):

        return output_file

    return None


# =========================================================
# SPLIT VIDEO
# =========================================================

def split_video(
    input_file,
    split_time
):

    try:

        split_time = float(
            split_time
        )

        if split_time <= 0:

            return None

    except (ValueError, TypeError):

        return None


    first_file = create_output_file(
        "split_part1"
    )

    second_file = create_output_file(
        "split_part2"
    )


    # First part
    command_first = [
        "ffmpeg",
        "-y",

        "-i",
        input_file,

        "-t",
        str(split_time),

        "-c:v",
        "libx264",

        "-c:a",
        "aac",

        first_file
    ]


    if not run_ffmpeg(
        command_first
    ):

        return None


    # Second part
    command_second = [
        "ffmpeg",
        "-y",

        "-i",
        input_file,

        "-ss",
        str(split_time),

        "-c:v",
        "libx264",

        "-c:a",
        "aac",

        second_file
    ]


    if not run_ffmpeg(
        command_second
    ):

        return None


    return {
        "first": first_file,
        "second": second_file
    }


# =========================================================
# MERGE VIDEOS
# =========================================================

def merge_videos(video_files):

    if not video_files:

        return None


    output_file = create_output_file(
        "merged"
    )


    concat_file = os.path.join(
        OUTPUT_FOLDER,
        "concat_"
        + uuid.uuid4().hex
        + ".txt"
    )


    try:

        with open(
            concat_file,
            "w",
            encoding="utf-8"
        ) as file:

            for video in video_files:

                absolute_path = os.path.abspath(
                    video
                )

                safe_path = (
                    absolute_path
                    .replace("\\", "/")
                    .replace("'", "'\\''")
                )

                file.write(
                    "file '"
                    + safe_path
                    + "'\n"
                )


        command = [
            "ffmpeg",
            "-y",

            "-f",
            "concat",

            "-safe",
            "0",

            "-i",
            concat_file,

            "-c:v",
            "libx264",

            "-c:a",
            "aac",

            output_file
        ]


        if run_ffmpeg(command):

            return output_file


        return None

    finally:

        if os.path.exists(
            concat_file
        ):

            os.remove(
                concat_file
            )


# =========================================================
# APPLY FILTER
# =========================================================

def apply_filter(
    input_file,
    filter_type
):

    output_file = create_output_file(
        "filtered"
    )


    filters = {

        "grayscale":
            "hue=s=0",

        "brightness":
            "eq=brightness=0.1",

        "sepia":
            "colorchannelmixer="
            "rr=0.393:rg=0.769:rb=0.189:"
            "gr=0.349:gg=0.686:gb=0.168:"
            "br=0.272:bg=0.534:bb=0.131",

        "none":
            "null"

    }


    video_filter = filters.get(
        filter_type,
        "null"
    )


    command = [
        "ffmpeg",
        "-y",

        "-i",
        input_file,

        "-vf",
        video_filter,

        "-c:v",
        "libx264",

        "-c:a",
        "aac",

        output_file
    ]


    if run_ffmpeg(command):

        return output_file

    return None


# =========================================================
# ADD BACKGROUND MUSIC
# =========================================================

def add_background_music(
    video_file,
    music_file
):

    output_file = create_output_file(
        "music"
    )


    command = [
        "ffmpeg",
        "-y",

        "-i",
        video_file,

        "-i",
        music_file,

        "-filter_complex",

        "[1:a]volume=0.35[music];"
        "[0:a][music]"
        "amix=inputs=2:"
        "duration=first:"
        "dropout_transition=2[a]",

        "-map",
        "0:v",

        "-map",
        "[a]",

        "-c:v",
        "copy",

        "-c:a",
        "aac",

        "-shortest",

        output_file
    ]


    if run_ffmpeg(command):

        return output_file

    return None


# =========================================================
# CHANGE AUDIO VOLUME
# =========================================================

def change_volume(
    input_file,
    volume
):

    output_file = create_output_file(
        "volume"
    )


    try:

        volume = float(
            volume
        )

    except (ValueError, TypeError):

        return None


    if volume < 0:

        volume = 0


    command = [
        "ffmpeg",
        "-y",

        "-i",
        input_file,

        "-af",
        f"volume={volume}",

        "-c:v",
        "copy",

        "-c:a",
        "aac",

        output_file
    ]


    if run_ffmpeg(command):

        return output_file

    return None


# =========================================================
# EXPORT FINAL VIDEO
# =========================================================

def export_video(
    input_file
):

    output_file = create_output_file(
        "final_export"
    )


    command = [
        "ffmpeg",
        "-y",

        "-i",
        input_file,

        "-c:v",
        "libx264",

        "-preset",
        "medium",

        "-crf",
        "23",

        "-c:a",
        "aac",

        "-b:a",
        "192k",

        "-movflags",
        "+faststart",

        output_file
    ]


    if run_ffmpeg(command):

        return output_file

    return None