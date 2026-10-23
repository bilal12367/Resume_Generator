
docker start finalized_mysql finalized_centrifugo
echo $?
if [ $? -eq 0 ]; then
    echo "Docker containers started successfully"
else
    echo "Docker containers not started"
    docker compose up -d
fi
cd server
gnome-terminal -- bash -c "uv run main.py"
echo $?

cd ../ui
gnome-terminal -- bash -c "npm run dev"
if [ $? -eq 0 ]; then
    google-chrome --app="http://localhost:5173"
fi
echo $?

